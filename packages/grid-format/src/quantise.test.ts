import { describe, expect, it } from 'vitest'
import { dequantise, NO_DATA, quantise } from './quantise'
import { VARIABLES } from './variables'

const { temperature, windSpeed } = VARIABLES

describe('quantise / dequantise', () => {
	it('round-trips 12.3°C', () => {
		expect(dequantise(quantise(12.3, temperature), temperature)).toBeCloseTo(
			12.3,
		)
	})

	it('handles negative temperatures', () => {
		expect(quantise(-4.7, temperature)).toBe(-47)
		expect(dequantise(-47, temperature)).toBeCloseTo(-4.7)
	})

	it('keeps round-trip error within half a step', () => {
		const result = dequantise(quantise(12.34, temperature), temperature)
		expect(Math.abs((result ?? Number.NaN) - 12.34)).toBeLessThanOrEqual(0.05)
	})

	it('stores null and NaN as NO_DATA, and reads NO_DATA back as null', () => {
		expect(quantise(null, temperature)).toBe(NO_DATA.int16)
		expect(quantise(Number.NaN, windSpeed)).toBe(NO_DATA.uint8)
		expect(dequantise(NO_DATA.int16, temperature)).toBeNull()
		expect(dequantise(NO_DATA.uint8, windSpeed)).toBeNull()
	})

	it('clamps out-of-range values', () => {
		expect(quantise(300, windSpeed)).toBe(254)
		expect(quantise(-5, windSpeed)).toBe(0)
	})
})
