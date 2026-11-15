import { describe, expect, it } from 'vitest'
import { RETIRE_AFTER_DAYS, retirement } from '../src/backend/migrate'

const DAY = 86_400_000
const now = 1_800_000_000_000

describe('old IndexedDB retirement', () => {
  it("starts the clock for older installs that stored '1'", () => expect(retirement('1', now)).toBe('stamp'))
  it('waits during the safety-net period', () => expect(retirement(String(now - 5 * DAY), now)).toBe('wait'))
  it('deletes after the period', () => expect(retirement(String(now - (RETIRE_AFTER_DAYS + 1) * DAY), now)).toBe('delete'))
  it('is done once cleaned', () => expect(retirement('cleaned', now)).toBe('done'))
})
