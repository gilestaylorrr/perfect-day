import path from 'node:path'

export default {
	plugins: {
		'@csstools/postcss-global-data': {
			files: [path.join(import.meta.dirname, 'src/styles/breakpoints.css')],
		},
		'postcss-custom-media': {},
		'postcss-nested': {},
		autoprefixer: {},
	},
}
