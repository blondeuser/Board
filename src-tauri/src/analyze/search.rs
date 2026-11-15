// Search by meaning, port of src/categorize/style/search.ts: cosine against every image embedding, kept when above an
// absolute floor and close to the best hit. Thresholds tuned for SigLIP (a clear match is ~0.05-0.1, a non-match ~0).
use std::collections::HashMap;

pub const SEARCH_FLOOR: f32 = 0.025;
pub const SEARCH_WINDOW: f32 = 0.03;

/// "a photo of <query>" with filler words stripped, as the model matches plain noun phrases best.
pub fn query_to_prompt(query: &str) -> String {
    fn strip<'a>(s: &'a str, words: &[&str]) -> &'a str {
        for w in words {
            if let Some(rest) = s.strip_prefix(w) {
                if rest.starts_with(char::is_whitespace) {
                    return rest.trim_start();
                }
            }
        }
        s
    }
    let t = query.trim();
    let lower = t.to_lowercase();
    let q = strip(strip(&lower, &["show me", "find", "the", "a", "an", "some"]), &["the", "a", "an"]);
    format!("a photo of {}", if q.is_empty() { t } else { q })
}

/// Unit-length vectors, so the dot product is the cosine. Best match first.
pub fn matches(query: &[f32], index: &HashMap<String, Vec<f32>>) -> Vec<(String, f32)> {
    let mut scored: Vec<(String, f32)> =
        index.iter().map(|(id, v)| (id.clone(), query.iter().zip(v).map(|(a, b)| a * b).sum())).collect();
    let best = scored.iter().map(|(_, s)| *s).fold(-1.0, f32::max);
    let cut = SEARCH_FLOOR.max(best - SEARCH_WINDOW);
    scored.retain(|(_, s)| *s >= cut);
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    scored
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_strips_fillers_like_the_ts_version() {
        assert_eq!(query_to_prompt("the man"), "a photo of man");
        assert_eq!(query_to_prompt("  Show me a red poster "), "a photo of red poster");
        assert_eq!(query_to_prompt("cat"), "a photo of cat");
        assert_eq!(query_to_prompt("another"), "a photo of another"); // 'a' only strips before whitespace
        assert_eq!(query_to_prompt("the"), "a photo of the");
    }

    #[test]
    fn keeps_hits_above_floor_and_near_the_best() {
        let idx: HashMap<String, Vec<f32>> =
            [("best", 0.10), ("near", 0.08), ("far", 0.05), ("low", 0.01)].iter().map(|(k, s)| (k.to_string(), vec![*s])).collect();
        let r = matches(&[1.0], &idx);
        assert_eq!(r.iter().map(|x| x.0.as_str()).collect::<Vec<_>>(), vec!["best", "near"]);
    }

    #[test]
    fn nothing_matches_below_the_floor() {
        let idx: HashMap<String, Vec<f32>> = [("a".to_string(), vec![0.01])].into();
        assert!(matches(&[1.0], &idx).is_empty());
    }
}
