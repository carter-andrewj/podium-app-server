




export default class Domain {


	constructor(executive, paths) {
		this.executive = executive
		this.paths = paths
	}

	
	// createCharter(charter) {
	// 	return new Promise((resolve, reject) => {

	// 		let lawPromise = this.createAllLaws(covenant.laws)
	// 		let rightsPromise = this.createAllRights(covenant.rights)
	// 		let sanctionPromise = this.createAllSanctions(covenant.sanctions) 

	// 		Promise.all([lawPromise, rightsPromise, sanctionsPromise])
	// 			.then(([lawIndex, rightsIndex, sanctionIndex]) => {

	// 				// Determine covenant account					
	// 				const charterAccount = this.path.forCharter()
	// 				this.charter = charterAccount.getAddress()

	// 				// Create covenant payload
	// 				const charterPayload = {
	// 					laws: lawIndex,
	// 					rights: rightIndex,
	// 					sanctons: sanctionIndex
	// 				}

	// 				// Send record
	// 				return this.sendRecord(
	// 					this.executive.identity,
	// 					[charterAccount],
	// 					charterPayload
	// 				)

	// 			})
	// 			.then(() => resolve(charterAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// loadCharter() {

	// }


	// createAllLaws(laws) {
	// 	return Promise.all(
	// 		laws.map((id, law) => this.createLaw(
	// 			`law-${id}`,
	// 			law.get("name"),
	// 			law.get("order"),
	// 			law.get("description"),
	// 			law.get("articles")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }


	// createLaw(id, name, order, description, articles) {
	// 	return new Promise((resolve, reject) => {

	// 		// Determine law account
	// 		const lawAccount = this.path.forLaw(id)

	// 		// Create articles for this law
	// 		this.createAllArticles(id, articles)
	// 			.then(articleIndex => {

	// 				// Make law payload
	// 				const lawPayload = {
	// 					id: id,
	// 					name: name,
	// 					order: order,
	// 					description: description,
	// 					articles: articleIndex.toJS()
	// 				}

	// 				return this.sendRecord(
	// 					this.executive.identity,
	// 					[lawAccount],
	// 					lawPayload
	// 				)

	// 			})
	// 			.then(() => resolve(lawAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// createAllArticles(law, articles) {
	// 	return Promise.all(
	// 		articles.map((id, article) => this.createArticle(
	// 			`${law}|article-${id}`,
	// 			article.get("name"),
	// 			article.get("order"),
	// 			article.get("intent"),
	// 			article.get("text"),
	// 			article.get("advice"),
	// 			article.get("tests"),
	// 			article.get("considerations")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }

	// createArticle(id, name, order, intent, text, advice, tests, considerations) {
	// 	return new Promise((resolve, reject) => {

	// 		// Create article account
	// 		const articleAccount = this.path.forLawArticle(id)

	// 		// Store advice, tests, and considerations
	// 		let advicePromise = this.createAllAdvice(id, advice)
	// 		let testsPromise = this.createAllTests(id, tests)
	// 		let considerationsPromise = this.createAllConsiderations(id, considerations)

	// 		// Wait for indexes to return
	// 		Promise.all([
	// 				advicePromise,
	// 				testsPromise,
	// 				considerationsPromise
	// 			])
	// 			.then(([adviceIndex, testIndex, considerationIndex]) => {

	// 				// Create payload
	// 				const articlePayload = {
	// 					id: id,
	// 					order: order,
	// 					intent: intent,
	// 					text: text,
	// 					advice: adviceIndex,
	// 					tests: testIndex,
	// 					considerations: considerationIndex
	// 				}

	// 				// Store payload
	// 				return this.sendRecord(
	// 					this.rootUser.identity,
	// 					[articleAccount],
	// 					articlePayload
	// 				)

	// 			})
	// 			.then(() => resolve(articleAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// createAllTests(article, tests) {
	// 	return Promise.all(
	// 		tests.map((id, test) => this.createTest(
	// 			`${article}|test-${id}`,
	// 			test.get("first", false),
	// 			test.get("text"),
	// 			test.get("options"),
	// 			test.get("outcome")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }

	// createTest(id, first, text, options, outcome) {
	// 	return new Promise((resolve, reject) => {

	// 		// Determine test account
	// 		const testAccount = this.path.forLawTest(id)

	// 		// Create test payload
	// 		const testPayload = {
	// 			id: id,
	// 			first: first,
	// 			text: text,
	// 			options: options,
	// 			outcome: outcome
	// 		}

	// 		// Store record
	// 		this.sendRecord(this.rootUser.identity, [testAccount], testPayload)
	// 			.then(() => resolve(testAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// createAllAdvice(article, adviceMap) {
	// 	return Promise.all(
	// 		adviceMap.map((id, advice) => this.createAdvice(
	// 			`${article}|advice-${id}`,
	// 			advice.get("text"),
	// 			advice.get("weight")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }

	// createAdvice(id, text, weight) {
	// 	return new Promise((resolve, reject) => {

	// 		// Determine advice account
	// 		const adviceAccount = this.path.forLawAdvice(id)

	// 		// Create advice payload
	// 		const advicePayload = {
	// 			id: id,
	// 			text: text,
	// 			weight: weight
	// 		}

	// 		// Store record
	// 		this.sendRecord(this.rootUser.identity, [adviceAccount], advicePayload)
	// 			.then(() => resolve(adviceAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// createAllConsiderations(article, considerationMap) {
	// 	return Promise.all(
	// 		considerationMap.map((id, consideration) => this.createConsideration(
	// 			`${article}|consideration-${id}`,
	// 			consideration.get("order"),
	// 			consideration.get("text"),
	// 			consideration.get("scale"),
	// 			consideration.get("range"),
	// 			consideration.get("weight")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)

	// }

	// createConsideration(id, order, text, scale, range, weight) {
	// 	return new Promise((resolve, reject) => {

	// 		// Determine consideration account
	// 		const considerationAccount = this.path.forLawConsideration(id)

	// 		// Create consideration payload
	// 		const considerationPayload = {
	// 			id: id,
	// 			order: order,
	// 			text: text,
	// 			scale: scale,
	// 			range: range,
	// 			weight: weight
	// 		}

	// 		// Send record
	// 		this.sendRecord(
	// 				this.rootUser.identity,
	// 				[considerationAccount],
	// 				considerationPayload
	// 			)
	// 			.then(() => resolve(considerationAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }



	// createAllRights(rights) {
	// 	return Promise.all(
	// 		rights.map((id, right) => this.createRight(
	// 			`right-${id}`,
	// 			right.get("name"),
	// 			right.get("description"),
	// 			right.get("levels")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }

	// createRight(id, name, description, levels) {
	// 	return new Promise((resolve, reject) => {

	// 		// Determine account for this right
	// 		const rightAccount = this.path.forRight(id)

	// 		// Create levels for this right
	// 		this.createAllLevels(id, levels)
	// 			.then(levelIndex => {

	// 				// Create right payload
	// 				const rightPayload = {
	// 					id: id,
	// 					name: name,
	// 					description: description,
	// 					levels: levelIndex
	// 				}

	// 				// Write record to ledger
	// 				return this.sendRecord(
	// 					this.rootUser.identity,
	// 					[rightAccount],
	// 					rightPayload
	// 				)

	// 			})
	// 			.then(() => resolve(rightAccount.getAddress()))
	// 			.catch(reject)

	// 	})
	// }


	// createAllLevels(right, levels) {
	// 	return Promise.all(
	// 		levels.map((id, level) => this.createLevel(
	// 			`${right}|level-${id}`,
	// 			level.get("initial", false),
	// 			level.get("order"),
	// 			level.get("requirements"),
	// 			level.get("permissions")
	// 		))
	// 		.toList()
	// 		.toJS()
	// 	)
	// }


}