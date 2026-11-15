// Port of src/categorize/color (palette.ts, convert.ts, families.ts): k-means in OKLab, 12 colour families.
// Must stay in step with the TS version until the TS import is dropped.
type Lab = [f64; 3];

fn to_linear(c: f64) -> f64 {
    let v = c / 255.0;
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}
fn from_linear(v: f64) -> u8 {
    let c = if v <= 0.0031308 { v * 12.92 } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 };
    (c.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn rgb_to_oklab(r: u8, g: u8, b: u8) -> Lab {
    let (lr, lg, lb) = (to_linear(r as f64), to_linear(g as f64), to_linear(b as f64));
    let l = (0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb).cbrt();
    let m = (0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb).cbrt();
    let s = (0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb).cbrt();
    [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
}

fn oklab_to_rgb([l_, a, b]: Lab) -> [u8; 3] {
    let l = (l_ + 0.3963377774 * a + 0.2158037573 * b).powi(3);
    let m = (l_ - 0.1055613458 * a - 0.0638541728 * b).powi(3);
    let s = (l_ - 0.0894841775 * a - 1.291485548 * b).powi(3);
    [
        from_linear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        from_linear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        from_linear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ]
}

fn dist2(a: &Lab, b: &Lab) -> f64 {
    (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)
}

pub struct PaletteColor {
    pub hex: String,
    pub share: f64,
}

/// `rgba` is width*height*4 bytes (already scaled down to ~64px by the caller). Colours sorted by share.
pub fn extract_palette(rgba: &[u8], width: usize, height: usize, k: usize) -> Vec<PaletteColor> {
    let step = ((width * height) / 4096).max(1);
    let pts: Vec<Lab> = (0..width * height)
        .step_by(step)
        .filter(|p| rgba[p * 4 + 3] >= 128)
        .map(|p| rgb_to_oklab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]))
        .collect();
    if pts.is_empty() {
        return vec![];
    }

    let mut centers: Vec<Lab> = vec![pts[0]];
    while centers.len() < k.min(pts.len()) {
        let (mut best, mut best_d) = (0, -1.0);
        for (i, p) in pts.iter().enumerate() {
            let d = centers.iter().map(|c| dist2(p, c)).fold(f64::INFINITY, f64::min);
            if d > best_d {
                best_d = d;
                best = i;
            }
        }
        if best_d <= 1e-6 {
            break; // fewer distinct colours than k
        }
        centers.push(pts[best]);
    }

    let mut assign = vec![0usize; pts.len()];
    for _ in 0..12 {
        for (i, p) in pts.iter().enumerate() {
            let mut bd = f64::INFINITY;
            for (ci, c) in centers.iter().enumerate() {
                let d = dist2(p, c);
                if d < bd {
                    bd = d;
                    assign[i] = ci;
                }
            }
        }
        let mut sums = vec![[0.0f64; 4]; centers.len()];
        for (p, &a) in pts.iter().zip(&assign) {
            sums[a][0] += p[0];
            sums[a][1] += p[1];
            sums[a][2] += p[2];
            sums[a][3] += 1.0;
        }
        for (c, s) in centers.iter_mut().zip(&sums) {
            if s[3] > 0.0 {
                *c = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
            }
        }
    }

    let mut counts = vec![0usize; centers.len()];
    assign.iter().for_each(|&a| counts[a] += 1);
    let mut out: Vec<(Lab, usize)> = centers.into_iter().zip(counts).filter(|(_, n)| *n > 0).collect();
    out.sort_by(|a, b| b.1.cmp(&a.1)); // stable, like JS sort
    out.into_iter()
        .map(|(c, n)| {
            let [r, g, b] = oklab_to_rgb(c);
            PaletteColor { hex: format!("#{r:02x}{g:02x}{b:02x}"), share: n as f64 / pts.len() as f64 }
        })
        .collect()
}

fn family_of(lab: Lab) -> &'static str {
    let (l, c) = (lab[0], lab[1].hypot(lab[2]));
    let mut h = lab[2].atan2(lab[1]).to_degrees();
    if h < 0.0 {
        h += 360.0;
    }
    if c < 0.035 || l < 0.18 || l > 0.96 {
        return if l < 0.28 { "black" } else if l > 0.9 { "white" } else { "gray" };
    }
    if (40.0..100.0).contains(&h) && l < 0.6 { return "brown" }
    if h >= 340.0 || h < 10.0 { return "pink" }
    if h < 40.0 { return if l > 0.8 { "pink" } else { "red" } }
    if h < 75.0 { return "orange" }
    if h < 115.0 { return "yellow" }
    if h < 170.0 { return "green" }
    if h < 220.0 { return "teal" }
    if h < 280.0 { return "blue" }
    if h < 335.0 { return "purple" }
    "pink"
}

/// Families covering at least 15% of the image (always the dominant one).
pub fn color_families(palette: &[PaletteColor]) -> Vec<&'static str> {
    let mut share: Vec<(&'static str, f64)> = vec![]; // insertion order = tie order, like the JS Map
    for p in palette {
        let n = u32::from_str_radix(&p.hex[1..], 16).unwrap_or(0);
        let f = family_of(rgb_to_oklab((n >> 16) as u8, (n >> 8) as u8, n as u8));
        match share.iter_mut().find(|(name, _)| *name == f) {
            Some(e) => e.1 += p.share,
            None => share.push((f, p.share)),
        }
    }
    share.sort_by(|a, b| b.1.total_cmp(&a.1));
    share.iter().enumerate().filter(|(i, (_, s))| *i == 0 || *s >= 0.15).map(|(_, (f, _))| *f).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(r: u8, g: u8, b: u8, n: usize) -> Vec<u8> {
        (0..n).flat_map(|_| [r, g, b, 255]).collect()
    }

    #[test]
    fn solid_red_is_one_red_colour() {
        let p = extract_palette(&solid(255, 0, 0, 64 * 64), 64, 64, 5);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].hex, "#ff0000");
        assert_eq!(color_families(&p), vec!["red"]);
    }

    #[test]
    fn two_halves_give_two_colours_and_families() {
        let mut px = solid(0, 0, 255, 2048);
        px.extend(solid(255, 255, 255, 2048));
        let p = extract_palette(&px, 64, 64, 5);
        assert_eq!(p.len(), 2);
        assert!((p[0].share - 0.5).abs() < 1e-9);
        let fam = color_families(&p);
        assert!(fam.contains(&"blue") && fam.contains(&"white"));
    }

    #[test]
    fn transparent_image_has_no_palette() {
        assert!(extract_palette(&[0, 0, 0, 0].repeat(16), 4, 4, 5).is_empty());
    }
}
