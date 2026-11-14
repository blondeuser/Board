import type { AssetSource } from '../../shared/types'
import type { LitEdition, LitEntry, LitProject } from './parse'

/** Credits kept with each photo, in display order: [label shown in the app, field on the LIT page]. */
const DETAIL_FIELDS: [string, string][] = [
  ['Company', 'Lighting Design/Product Company'],
  ['Lead designers', 'Lead Designers'],
  ['Architect', 'Architecture Company'],
  ['Interior design', 'Interior Design Company'],
  ['Client', 'Client'],
  ['Location', 'Project Location'],
  ['Completed', 'Completion Date'],
]

/** The source record stored on an imported LIT photo: where it came from, credits, and the award categories. */
export function litSource(edition: LitEdition | undefined, entry: LitEntry, project: LitProject, imageUrl: string): AssetSource {
  const details: Record<string, string> = {}
  if (edition) details.Edition = edition.label
  for (const [label, field] of DETAIL_FIELDS) {
    const v = project.fields[field]
    if (v) details[label] = v
  }
  if (!details.Company && entry.company) details.Company = entry.company
  const link = project.links['Project Link']
  if (link) details['Project website'] = link
  return {
    site: 'LIT Awards',
    url: project.url,
    imageUrl,
    title: project.title || entry.project,
    categories: [...new Set([...entry.categories, ...project.categories])],
    credit: project.fields['Photo Credits'],
    details,
  }
}
