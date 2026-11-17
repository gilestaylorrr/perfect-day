export type StorageType = 'int16' | 'uint8'

export interface VariableSpec {
	readonly type: StorageType
	/** Stored value = real value × scale, rounded to a whole number. */
	readonly scale: number
	readonly unit: string
}

export const VARIABLES = {
	temperature: { type: 'int16', scale: 10, unit: '°C' },
	cloudCover: { type: 'uint8', scale: 1, unit: '%' },
	windSpeed: { type: 'uint8', scale: 1, unit: 'km/h' },
	precipitationProbability: { type: 'uint8', scale: 1, unit: '%' },
	sunshine: { type: 'uint8', scale: 1, unit: 'min' },
} as const satisfies Record<string, VariableSpec>

export type VariableName = keyof typeof VARIABLES
