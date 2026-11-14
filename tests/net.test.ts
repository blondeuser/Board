import { describe, expect, it } from 'vitest'
import { isPublicHost } from '../src/sources/net'

describe('isPublicHost', () => {
  it('accepts ordinary public hosts and addresses', () => {
    for (const h of ['example.com', 'www.litawards.com', 'cdn.example.co.uk', '8.8.8.8', '104.20.23.154', '172.66.147.243', '2606:4700:10::6814:179a']) expect(isPublicHost(h), h).toBe(true)
  })
  it('refuses local and private names and addresses', () => {
    for (const h of ['localhost', 'a.localhost', 'printer.local', 'nas', '127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '[::1]', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', ''])
      expect(isPublicHost(h), h).toBe(false)
  })
  it('keeps 172.x outside the private block', () => expect(isPublicHost('172.32.0.1')).toBe(true))
})
