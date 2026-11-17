import type { StorageType, VariableSpec } from './variables'

/** Reserved stored values meaning "no data". */
export const NO_DATA: Record<StorageType, number> = {
	int16: -32768,
	uint8: 255,
}

/** Valid stored range for each type, excluding the NO_DATA value. */
const RANGE: Record<StorageType, { min: number; max: number }> = {
	int16: { min: -32767, max: 32767 },
	uint8: { min: 0, max: 254 },
}

/**
 * Converts a real value to its stored whole number. Missing or non-finite
 * values become NO_DATA; out-of-range values are clamped so they can never
 * collide with it.
 */
export const quantise = (value: number | null, spec: VariableSpec): number => {
	if (value === null || !Number.isFinite(value)) return NO_DATA[spec.type]

	const { min, max } = RANGE[spec.type]
	return Math.min(max, Math.max(min, Math.round(value * spec.scale)))
}

/** Converts a stored whole number back to its real value, or null for NO_DATA. */
export const dequantise = (
	stored: number,
	spec: VariableSpec,
): number | null => {
	if (stored === NO_DATA[spec.type]) return null

	return stored / spec.scale
}
