import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlText, parseIndex, parseWinner } from '../src/sources/lit/parse'
import { litSource } from '../src/sources/lit/source'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/lit/${name}`, import.meta.url), 'utf8')

describe('LIT winners page', () => {
  const index = parseIndex(fixture('winners-2025.html'))

  it('reads the edition list and the selected edition', () => {
    expect(index.edition).toBe('LIT Design Awards 2025')
    expect(index.editions.map((e) => e.value)).toEqual(['LIT Design Awards 2025', 'LIT Design Awards 2024', 'LIT Awards 2021', 'LIT Awards 2017'])
    expect(index.editions[2]).toEqual({ value: 'LIT Awards 2021', label: 'LIT Design Awards 2021', year: 2021 })
  })

  it('merges a project listed in several sections into one entry with all its categories', () => {
    expect(index.entries.map((e) => e.id)).toEqual(['4828', '4829', '4330', '4332'])
    const cinema = index.entries.find((e) => e.id === '4330')!
    expect(cinema.categories).toEqual(['Ambient Lighting', 'Interior Architectural Illumination'])
    expect(cinema.company).toBe('Lightlinks International Limited') // not the commented-out duplicate
    expect(cinema.url).toBe('https://litawards.com/winners/winner.php?id=4330&mode=win')
  })

  it('turns the top cards into "… of the Year" categories and decodes entities', () => {
    const memorial = index.entries.find((e) => e.id === '4828')!
    expect(memorial.company).toBe('Atiaîa Lighting Design')
    expect(memorial.categories).toEqual(['Architectural Lighting Design of the Year', 'Visitor Experience & Museum Exhibition'])
    expect(memorial.cover).toMatch(/\/medium\/c183ca90.*\.jpg$/)
    expect(index.entries.find((e) => e.id === '4829')!.project).toBe('Amphora')
  })

  it('lists categories in page order without duplicates', () => {
    expect(index.categories).toEqual([
      'Architectural Lighting Design of the Year',
      'Lighting Product Design of the Year',
      'Ambient Lighting',
      'Interior Architectural Illumination',
      'Visitor Experience & Museum Exhibition',
    ])
  })
})

describe('LIT winner page', () => {
  const p = parseWinner(fixture('winner-4828.html'), '4828')

  it('reads title, categories and credits', () => {
    expect(p.title).toBe('Memorial Brumadinho')
    expect(p.categories).toEqual(['Visitor Experience & Museum Exhibition'])
    expect(p.fields['Photo Credits']).toBe('Pedro Mascaro and Leo Drumond/Nitro')
    expect(p.fields['Project Location']).toBe('Córrego do Feijão, Brumadinho - Minas Gerais, Brazil')
    expect(p.fields['Entry Description']).toMatch(/^Brumadinho Memorial is a space.*\n\nLight guides the journey/s)
    expect(p.fields['Awards and Prize']).toBeUndefined() // commented out on the page
    expect(p.links['Project Link']).toBe('https://www.memorialbrumadinho.org.br/')
  })

  it('collects the full-size gallery photos only (no logo or certificate)', () => {
    expect(p.images).toHaveLength(3)
    expect(p.images.every((u) => u.includes('/full/') && u.endsWith('.jpg'))).toBe(true)
    expect(p.images[0]).toMatch(/c183ca90/)
  })

  it('builds a searchable source record for each photo', () => {
    const index = parseIndex(fixture('winners-2025.html'))
    const entry = index.entries.find((e) => e.id === '4828')!
    const s = litSource(index.editions[0], entry, p, p.images[1])
    expect(s).toMatchObject({
      site: 'LIT Awards',
      url: p.url,
      imageUrl: p.images[1],
      title: 'Memorial Brumadinho',
      credit: 'Pedro Mascaro and Leo Drumond/Nitro',
    })
    // The winners page knows the "of the Year" award; the detail page doesn't: keep both.
    expect(s.categories).toEqual(['Architectural Lighting Design of the Year', 'Visitor Experience & Museum Exhibition'])
    expect(s.details).toMatchObject({ Edition: 'LIT Design Awards 2025', Company: 'Atiaîa Lighting Design', 'Lead designers': 'Mariana Novaes' })
  })
})

describe('older LIT pages (2017-2018)', () => {
  it('reads photos hosted on litawards.com itself', () => {
    const html = `<div class="winner-main-image"><img src="https://litawards.com/submit/upload/22069/_LIT_1.jpg" /></div>
      <div class="grid grid-gutters image-thumbs">
        <a href="https://litawards.com/submit/upload/22069/_LIT_1.jpg"><img src="https://litawards.com/submit/upload/22069/_LIT_1.jpg" /></a>
        <a href="https://litawards.com/submit/upload/22069/_LIT_2.jpg"><img src="https://litawards.com/submit/upload/22069/_LIT_2.jpg" /></a>
      </div>
      <h1>Waterlicht</h1>
      <img src="https://litawards.com/submit/certificate/winner_asset/LIT-Awards-2017.png">`
    expect(parseWinner(html, '1').images).toEqual(['https://litawards.com/submit/upload/22069/_LIT_1.jpg', 'https://litawards.com/submit/upload/22069/_LIT_2.jpg'])
  })
  it('does not double "of the Year" when the prize already says it', () => {
    const html = `<div class="grid-cell grid-1-2"><a href="winner.php?id=9&mode=win"><div class="project-agency">X</div><div class="project-prize">LIGHTING DESIGNER OF THE YEAR</div></a></div>`
    expect(parseIndex(html).entries[0].categories).toEqual(['Lighting Designer of the Year'])
  })
})

describe('html helpers', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('A &amp; B &#039;x&#x27; &eacute;')).toBe("A & B 'x' &eacute;")
  })
  it('keeps line breaks from <br>', () => {
    expect(htmlText('a<br />b</br>  c  <b>d</b>')).toBe('a\nb\nc d')
  })
})
