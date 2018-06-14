#!/usr/bin/env node
'use strict'

const fetch = require('./')

async function main () {
	try {
		const signals = await fetch()
		console.log(JSON.stringify(signals, null, '  '))
	}
	catch (e) {
		console.error(e)
		process.exit(-1)
	}
}

main()
