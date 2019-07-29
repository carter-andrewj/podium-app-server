import { Map, List, fromJS, OrderedSet } from 'immutable';

import LedgerError from './ledgerError';
import { checkThrow } from './utils';





export default class Post {


	constructor(ledger, address) {
		this.ledger = ledger
		this.address = address
	}


	content() {
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path.forPost(this.address))
				.then(postHistory => {

					// Collate post content
					var postContent = postHistory.reduce(
						(post, next) => {
							// TODO - Merge edits and retractions
							//		  into a single cohesive map

							// Combine entries from long posts
							if (next.get("entry") || next.get("entry") === 0) {
								post = post
									.update("textList",
										l => l.set(
											next.get("entry"),
											next.get("text")
										)
									)
									.delete("entry")
							}

							// Collate timestamps
							const lastTime = post.get("created")
							const nextTime = next.get("created")
							let created;
							let latest;
							if (lastTime && nextTime) {
								created = Math.min(lastTime, nextTime)
								latest = Math.max(lastTime, nextTime)
							} else {
								created = lastTime || nextTime
								latest = lastTime || nextTime
							}

							// Return completed post
							return post
								.mergeDeep(next)
								.set("created", created)
								.set("latest", latest)

						},
						Map({
							textList: List()
						})
					)

					// Combine post content
					if (postContent.get("entries") !==
							postContent.get("textList").size) {
						postContent = postContent.set("incomplete", true)
					} else {
						postContent = postContent.set(
							"text",
							postContent.get("textList")
								.reduce((a, b) => `${a}${b}`)
						)
					}

					// Return post content
					resolve(postContent)

				})
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						this.content().then(resolve).catch(reject)
					} else {
						reject(error)
					}
				})
		})
	}



	replyIndex() {
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path
					.forRepliesToPost(this.address))
				.then(index => {
					index = index
						.map(r => r.get("address"))
						.toOrderedSet()
					resolve(index)
				})
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(OrderedSet())
					} else {
						reject(error)
					}
				})
		})
	}

	promotionIndex() {
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path.forPromotionsOfPost(this.address))
				.then(index => {
					index = index.map(r => r.get("address")).toOrderedSet()
					resolve(index)
				})
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(OrderedSet())
					} else {
						reject(error)
					}
				})
		})
	}

	reportIndex() {
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path
					.forReportsOfPost(this.address))
				.then(index => {
					index = index.map(r => r.get("address")).toOrderedSet()
					resolve(index)
				})
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(OrderedSet())
					} else {
						reject(error)
					}
				})
		})
	}


}




// export class PodiumClientPost extends PodiumPost {


// 	constructor(podium, address) {
// 		super(podium, address)
// 		this.cache = new PodiumCache({
// 			content: Map(),
// 			replies: OrderedSet(),
// 			promotions: OrderedSet(),
// 			reports: OrderedSet()
// 		})
// 	}



// 	get text() { return this.cache.get("content", "text") }
// 	get mentions() { return this.cache.get("content", "mentions") }

// 	get created() { return new Date(this.cache.get("content", "created")) }
// 	get latest() { return new Date(this.cache.get("content", "latest")) }

// 	get parentAddress() { return this.cache.get("content", "parent")}
// 	get parent() { return this.podium.post(this.parentAddress) }
// 	get grandparentAddress() { return this.cache.get("content", "grandparent") }
// 	get grandparent() { return this.podium.post(this.grandparentAddress) }
// 	get originAddress() { return this.cache.get("content", "origin") }
// 	get origin() { return (this.address !== this.originAddress) ? 
// 		this.podium.post(this.originAddress) : this }
// 	get depth() { return this.cache.get("content", "depth") }

// 	get authorAddress() { return this.cache.get("content", "author") }
// 	get author() { return this.podium.user(this.authorAddress) }

// 	get replies() {
// 		return this.cache
// 			.get("replies")
// 			.map(r => this.podium.post(r))
// 			.toList()
// 	}

// 	load(force = false) {
// 		return new Promise((resolve, reject) => {
// 			var contentPromise = this.content(force)
// 			var replyPromise = this.replyIndex(force)
// 			var promoPromise = this.promoIndex(force)
// 			var reportPromise = this.reportIndex(force)
// 			Promise.all([contentPromise, replyPromise,
// 						 promoPromise, reportPromise])
// 				.then(() => resolve(this))
// 				.catch(error => reject(error))
// 		})
// 	}


// 	content(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("content")) {
// 				resolve(this.cache.get("content"))
// 			} else {
// 				PodiumPost.prototype.content.call(this)
// 					.then(postContent => {
// 						this.cache.swap("content", postContent)
// 						resolve(postContent)
// 					})
// 					.catch(error => reject(error))
// 			}
// 		})
// 	}


// 	withContent() {
// 		return new Promise((resolve, reject) => {
// 			this.content(false)
// 				.then(() => resolve(this))
// 				.catch(reject)
// 		})
// 	}


// 	replyIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("replies")) {
// 				resolve(this.cache.get("replies"))
// 			} else {
// 				PodiumPost.prototype.replyIndex.call(this)
// 					.then(index => {
// 						this.cache.swap("replies", index)
// 						resolve(index)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("replies")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}

// 	promoIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("promotions")) {
// 				resolve(this.cache.get("promotions"))
// 			} else {
// 				PodiumPost.prototype.promotionIndex.call(this)
// 					.then(index => {
// 						this.cache.swap("promotions", index)
// 						resolve(index)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("promotions")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}

// 	reportIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("reports")) {
// 				resolve(this.cache.get("reports"))
// 			} else {
// 				PodiumPost.prototype.reportIndex.call(this)
// 					.then(index => {
// 						this.cache.swap("reports", index)
// 						resolve(index)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("reports")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}



// }



