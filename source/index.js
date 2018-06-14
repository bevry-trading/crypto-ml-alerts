'use strict'

const username = process.env.CRYPTO_ML_USERNAME
const password = process.env.CRYPTO_ML_PASSWORD
const debug = Boolean(process.env.CRYPTO_ML_DEBUG)

if (process.env.TZ !== 'Etc/UTC') {
	console.error(
		'To ensure dates are correct, you must run this app like so:\n' +
		'env TZ=Etc/UTC crypto-ml-alerts'
	)
	process.exit(-1)
}

if (!username || !password) {
	console.error(
		'You must provide the username and password to this app via environment variables.\n' +
		'If you want to provide them via the invocation of the app, you would do it like so:\n' +
		'env TZ=Etc/UTC CRYPTO_ML_USERNAME=USERNAME CRYPTO_ML_PASSWORD=PASSWORD crypto-ml-alerts'
	)
	process.exit(-1)
}

const { isError } = require('typechecker')
const puppeteer = require('puppeteer')

/*
// consider hitting https://crypto-ml.com/feed/ instead
const xml2js = require('xml2js')
function parseXML (xml) {
	return new Promise(function (resolve, reject) {
		xml2js.parseString(xml, function (err, result) {
			if (err) return reject(err)
			resolve(result)
		})
	})
}
*/

function pad (number) {
	if (number < 10) {
		return '0' + number
	}
	return number
}
function getToday () {
	return new Date()
}
function getYesterday () {
	return new Date(new Date().setDate(new Date().getDate() - 1))
}

const today = getToday()
const yesterday = getYesterday()

// const date = '2018-13-06'
// const dateForUrl = date.split('-').map((i) => i.replace(/^0/, '')).reverse().join('-')

async function getAlert (browser, page, when) {
	const dateForResult = [when.getUTCFullYear(), pad(when.getUTCMonth() + 1), pad(when.getUTCDate())].join('-')
	const dateForUrl = [when.getUTCMonth() + 1, when.getUTCDate(), when.getUTCFullYear()].join('-')
	await page.goto(`https://crypto-ml.com/trade-alert/trade-alert-for-${dateForUrl}/`)

	try {
		const tables = await page.evaluate(() => {
			/* eslint no-undef:1 */
			const header = document.querySelector('#content_box h1')
			if (header && header.textContent.toLowerCase().indexOf('error') !== -1) {
				throw new Error(header.textContent)
			}

			const tables = Array.from(document.querySelectorAll('.thecontent table'))
			return tables.map(
				(table) => Array.from(table.querySelectorAll('tr')).map(
					(row) => Array.from(row.querySelectorAll('td')).map(
						(column) => column.textContent.trim())
				)
			)
		})

		const signals = [].concat(
			tables[0].slice(1).map((row) => ({
				when: when === today ? 'today' : 'yesterday',
				date: dateForResult,
				currency: row[0],
				action: row[1],
				price: row[2]
			})),
			tables[1].slice(1).map((row) => {
				const priceDate = row[2].split(' on ')
				const [month, day, year] = priceDate[1].split('/')
				return {
					when: 'previous',
					date: [['20', year].join(''), month, day].join('-'),
					currency: row[0],
					action: row[1],
					price: priceDate[0]
				}
			})
		)

		return signals
	}
	catch (e) {
		return Promise.reject(e)
	}
}

async function login (browser, page) {
	await page.goto('https://crypto-ml.com/login/')

	await page.type('#user_login', username)
	await page.type('#user_pass', password)
	await page.click('#wp-submit')

	return new Promise(function (resolve, reject) {
		browser.on('targetchanged', function (e) {
			const url = e.url()
			if (url === 'https://crypto-ml.com/member-dashboard/') {
				resolve()
			}
			else {
				reject(new Error('unknown login redirect page: ' + url))
			}
		})
	})

}

async function main () {
	// const feedString = require('fs').promises.readFile('./feed.xml', 'utf8')
	// const feedData = await parseXML(feedString)
	// console.log(feedData)

	const headless = !debug
	const browser = await puppeteer.launch({ headless })
	const page = await browser.newPage()

	await login(browser, page)

	try {
		const signals = await getAlert(browser, page, today)
		await browser.close()
		return signals
	}
	catch (e) {
		if (e.message.indexOf('404') !== -1) {
			try {
				const signals = await getAlert(browser, page, yesterday)
				await browser.close()
				return signals
			}
			catch (e) {
				await browser.close()
				return Promise.reject(e)
			}
		}

		await browser.close()
		return Promise.reject(e)
	}
}

module.exports = main
