import { Map, OrderedSet, List, fromJS } from 'immutable';

import { RadixSimpleIdentity, RadixKeyStore, RadixLogger } from 'radixdlt';

import LedgerError from './ledgerError';

import { postCost, chunkText, filterAsync, checkThrow } from './utils';






export default class User {



	constructor(ledger, address) {
		this.ledger = ledger
		this.address = address

		this.keyIn = this.keyIn.bind(this)
	}




// SIGN IN

	keyIn(keyPair, passphrase) {
		return new Promise((resolve, reject) => {
			RadixKeyStore
				.decryptKey(keyPair, passphrase)
				.then(key => {
					const ident = new RadixSimpleIdentity(key);
					if (!this.address) {
						this.address = ident.account.getAddress();
					}
					resolve({
						user: new ActiveUser(this.ledger, ident),
						keyPair: keyPair
					})
				})
				.catch(reject)
		})
	}

	signIn(identity, passphrase) {
		this.ledger.debugOut("Signing In: ", passphrase)
		return new Promise((resolve, reject) => {
			let keyPair;
			const path = this.ledger.path
				.forKeystoreOf(identity, passphrase)
			this.ledger

				// Retrieve keypair
				.getLatest(path)

				// Decrypt keypair and retrieve identity
				.then(encryptedKey => {
					keyPair = encryptedKey.toJS()
					this.ledger.debugOut("Received Keypair")
					return this.keyIn(keyPair, passphrase)
				})

				.then(resolve)
				.catch(reject)

		})
	}





// USER PROFILES

	profile() {
		this.ledger.debugOut(`Fetching the profile of User-${this.address}`)
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path.forProfileOf(this.address))
				.then(history => history.reduce((a, b) =>
						a.mergeDeep(b.delete("record").delete("type"))
					), Map())
				.then(resolve)
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						this.profile().then(resolve).catch(reject)
					} else {
						reject(error)
					}
				})
		})
	}




// TOKENS

	transactionIndex() {
		this.ledger.debugOut(`Fetching the transactions of User-${this.address}`)
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path.forPODTransactionsOf(this.address))
				.then(resolve)
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(this.transactionIndex())
					} else {
						reject(error)
					}
				})
		})
	}


	getBalance() {
		return new Promise((resolve, reject) => {
			this.transactionIndex(true)
				.then(transactions => transactions
					.reduce((total, next) => total + next.get("value"), 0))
				.then(resolve)
				.catch(reject)
		})
	}


	onTransaction(callback) {
		this.ledger.debugOut(`Added a callback for each transaction with User-${this.address}`)
		this.ledger.openChannel(
			this.ledger.path.forPODTransactionsOf(this.address),
			record => Promise
				.resolve(callback(record))
				.catch(console.error)
		)
	}




// POSTS

	postIndex() {
		this.ledger.debugOut(`Fetching the posts of User-${this.address}`)
		return new Promise((resolve, reject) => {
			this.ledger
				.getHistory(this.ledger.path.forPostsBy(this.address))
				.then(index => {
					index = index.map(i => i.get("address")).reverse().toOrderedSet()
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


	onPost(callback) {
		this.ledger.debugOut(`Added a callback for each post by User-${this.address}`)
		this.ledger.openChannel(
			this.ledger.path.forPostsBy(this.address),
			record => callback(record.get("address"))
		)
	}





// FOLLOWING


	isFollowing(address, force = false) {
		this.ledger.debugOut(`Checking if User-${this.address} is following User-${address}`)
		return new Promise((resolve, reject) => {
			this.followingIndex(force)
				.then(index => resolve(index.includes(address)))
				.catch(error => resolve(false))
		})
	}


	isFollowedBy(address, force = false) {
		this.ledger.debugOut(`Checking if User-${this.address} is followed by User-${address}`)
		return new Promise((resolve, reject) => {
			this.followerIndex(force)
				.then(index => resolve(index.includes(address)))
				.catch(error => resolve(false))
		})
	}


	followingIndex(address=this.address) {
		this.ledger.debugOut(`Fetching index of users followed by User-${this.address}`)
		return new Promise((resolve, reject) => {

			// Get location for records of followed users
			const followingAccount = this.ledger.path
				.forUsersFollowedBy(address)

			// Load following users
			this.ledger
				.getHistory(followingAccount)
				.then(history => history.reduce(
					(index, next) => {
						const addr = next.get("address")
						if (next.get("status")) {
							return index.add(addr)
						} else {
							return index.delete(addr)
						}
					},
					OrderedSet()
				))
				.then(resolve)
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(OrderedSet())
					} else {
						reject(error)
					}
				})

		})
	}


	followerIndex(address=this.address) {
		this.ledger.debugOut(`Fetching index of users who follow User-${this.address}`)
		return new Promise((resolve, reject) => {

			// Get location for records of followed users
			const followAccount = this.ledger.path
				.forUsersFollowing(address)

			// Load followers
			this.ledger.getHistory(followAccount)

				.then(history => history.reduce(
					(index, next) => {
						const addr = next.get("address")
						if (next.get("status")) {
							return index.add(addr)
						} else {
							return index.delete(addr)
						}
					},
					OrderedSet()
				))
				.then(resolve)

				// Handle errors and assume any time-out
				// error resulted from an empty address
				// (i.e. a user with 0 followers)
				.catch(error => {
					if (error instanceof LedgerError && error.code === 2) {
						resolve(OrderedSet())
					} else {
						reject(error)
					}
				})

		})
	}


	onFollow(callback) {
		this.ledger.debugOut(`Added a callback for each user following User-${this.address}`)
		this.ledger.openChannel(
			this.ledger.path.forUsersFollowedBy(this.address),
			record => Promise
				.resolve(callback(record.get("address")))
				.catch(console.error)
		)
	}

	onFollowed(callback) {
		this.ledger.debugOut(`Added a callback for each user followed by User-${this.address}`)
		this.ledger.openChannel(
			this.ledger.path.forUsersFollowing(this.address),
			record => Promise
				.resolve(callback(record.get("address")))
				.catch(console.error)
		)
	}


}







// export class PodiumClientUser extends PodiumUser {
	

// 	constructor(podium, address) {
// 		super(podium, address)
// 		this.cache = new PodiumCache({
// 			profile: Map(),
// 			followers: OrderedSet(),
// 			following: OrderedSet(),
// 			posts: OrderedSet(),
// 			transactions: List(),
// 			promoted: OrderedSet(),
// 			reports: OrderedSet(),
// 			alerts: OrderedSet()
// 		})
// 	}


// 	// GETTERS

// 	get id() { return this.cache.get("profile", "id") }
// 	get name() { return this.cache.get("profile", "name") }
// 	get bio() { return this.cache.get("profile", "bio") }

// 	get created() { return new Date(this.cache.get("profile", "created")) }
// 	get latest() { return new Date(this.cache.get("content", "latest")) }

// 	get picture() { return this.cache.get("profile", "pictureURL") }

// 	get transactions() { return this.cache.get("transactions") }
// 	get balance() {
// 		return this.cache
// 			.get("transactions")
// 			.reduce((total, next) => total + next.get("value"), 0)
// 	}

// 	get posts() {
// 		return this.cache
// 			.get("posts")
// 			.map(p => this.podium.post(p))
// 			.toList()
// 	}

// 	get following() {
// 		return this.cache
// 			.get("following")
// 			.map(f => this.podium.user(f))
// 			.toList()
// 	}

// 	get followers() {
// 		return this.cache
// 			.get("followers")
// 			.map(f => this.podium.user(f))
// 			.toList()
// 	}


// 	load(force = false) {
// 		this.debugOut(`Loading all data for User-${this.address}`)
// 		return new Promise((resolve, reject) => {
// 			var profilePromise = this.profile(force)
// 			var transactionPromise = this.transactionIndex(force)
// 			var postsPromise = this.postIndex(force)
// 			var followedPromise = this.followingIndex(force)
// 			var followerPromise = this.followerIndex(force)
// 			Promise.all([profilePromise, transactionPromise, postsPromise, 
// 						 followedPromise, followerPromise])
// 				.then(() => resolve(this))
// 				.catch(error => reject(error))
// 		})
// 	}


// 	activeUser(identity) {
// 		var newActiveUser = new PodiumClientActiveUser(this.podium, identity)
// 		return newActiveUser
// 	}


// 	profile(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("profile")) {
// 				this.debugOut(`Serving cached profile for User-${this.address}`)
// 				resolve(this.cache.get("profile"))
// 			} else {
// 				PodiumUser.prototype.profile.call(this)
// 					.then(profile => {
// 						this.cache.swap("profile", profile)
// 						resolve(profile)
// 					})
// 					.catch(error => reject(error))
// 			}
// 		})
// 	}


// 	withProfile(force = false) {
// 		this.debugOut(`Ensuring profile of User-${this.address} is loaded before proceeding`)
// 		return new Promise((resolve, reject) => {
// 			this.profile(force)
// 				.then(() => resolve(this))
// 				.catch(reject)
// 		})
// 	}


// 	transactionIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("transactions")) {
// 				this.debugOut(`Serving cached transactions for User-${this.address}`)
// 				resolve(this.cache.get("transactions"))
// 			} else {
// 				PodiumUser.prototype.transactionIndex.call(this)
// 					.then(transactions => {
// 						const balance = transactions.reduce(
// 							(total, next) => total + next.get("value"),
// 							0
// 						)
// 						this.cache.swap("transactions", transactions)
// 						this.cache.swap("balance", balance)
// 						resolve(transactions)
// 					})
// 					.catch(reject)
// 			}
// 		})
// 	}


// 	withTransactions(force = false) {
// 		this.debugOut(`Ensuring transactions of User-${this.address} is loaded before proceeding`)
// 		return new Promise((resolve, reject) => {
// 			this.transactionIndex(force)
// 				.then(() => resolve(this))
// 				.catch(reject)
// 		})
// 	}


// 	postIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("posts")) {
// 				this.debugOut(`Serving cached post index of user ${this.address}`)
// 				resolve(this.cache.get("posts"))
// 			} else {
// 				PodiumUser.prototype.postIndex.call(this)
// 					.then(posts => {
// 						this.cache.swap("posts", posts)
// 						resolve(posts)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("posts")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}


// 	followingIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("followed")) {
// 				this.debugOut(`Serving cached index of users followed of User-${this.address}`)
// 				resolve(this.cache.get("followed"))
// 			} else {
// 				PodiumUser.prototype.followingIndex.call(this)
// 					.then(followed => {
// 						this.cache.swap("followed", followed)
// 						resolve(followed)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("followed")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}


// 	followerIndex(force = false) {
// 		return new Promise((resolve, reject) => {
// 			if (!force && this.cache.is("followers")) {
// 				this.debugOut(`Serving cached index of users following User-${this.address}`)
// 				resolve(this.cache.get("followers"))
// 			} else {
// 				PodiumUser.prototype.followerIndex.call(this)
// 					.then(followers => {
// 						this.cache.swap("followers", followers)
// 						resolve(followers)
// 					})
// 					.catch(error => {
// 						if (error.code === 2) {
// 							this.cache.clear("followers")
// 							resolve(OrderedSet())
// 						} else {
// 							reject(error)
// 						}
// 					})
// 			}
// 		})
// 	}


// }











export class ActiveUser extends User {


	constructor(ledger, identity) {
		super(ledger, identity.account.getAddress())
		this.identity = identity
	}



// ACCOUNT UPDATING

	updateUserIdentifier() {}

	updatePassword() {}





// USER PROFILES

	updateProfile(profile) {
		this.ledger.debugOut(`User-${this.address} is updating their profile`)
		return new Promise(async (resolve, reject) => {

			// Generate user public record
			const profileAccount = this.ledger.path.forProfileOf(this.address);
			const profilePayload = profile

			// Write record
			this.ledger
				.storeRecord(this.identity, [profileAccount], profilePayload)
				.then(resolve)
				.catch(reject)		

		})
	}

	// updateProfileName(name) {
	// 	this.ledger.debugOut(`User-${this.address} is updating their display name to "${name}"`)
	// 	return new Promise(async (resolve, reject) => {
			
	// 		// Generate user public record
	// 		const profileAccount = this.ledger.path.forProfileOf(this.address);
	// 		const profilePayload = {
	// 			record: "profile",
	// 			type: "image",
	// 			name: name
	// 		}

	// 		// Write record
	// 		this.ledger
	// 			.storeRecord(this.identity, [profileAccount], profilePayload)
	// 			.then(() => resolve())
	// 			.catch(error => reject(error))

	// 	})
	// }

	// updateProfileBio(bio) {
	// 	this.ledger.debugOut(`User-${this.address} is updating their bio to "${bio}"`)
	// 	return new Promise(async (resolve, reject) => {
			
	// 		// Generate user public record
	// 		const profileAccount = this.ledger.path.forProfileOf(this.address);
	// 		const profilePayload = {
	// 			record: "profile",
	// 			type: "bio",
	// 			bio: bio
	// 		}

	// 		// Write record
	// 		this.ledger
	// 			.storeRecord(this.identity, [profileAccount], profilePayload)
	// 			.then(() => resolve())
	// 			.catch(error => reject(error))

	// 	})
	// }

	// updateProfilePicture(image, ext) {
	// 	this.ledger.debugOut(`User-${this.address} is updating their profile picture`)
	// 	return new Promise(async (resolve, reject) => {
			
	// 		// Store media
	// 		this.createMedia(image, ext)
	// 			.then(url => {

	// 				// Generate user public record
	// 				const profileAccount = this.ledger.path.forProfileOf(this.address)
	// 				const profilePayload = {
	// 					record: "profile",
	// 					type: "image",
	// 					picture: url
	// 				}

	// 				// Write record
	// 				this.ledger
	// 					.storeRecord(this.identity, [profileAccount], profilePayload)
	// 					.then(() => resolve())
	// 					.catch(error => reject(error))

	// 			})
	// 			.catch(error => reject(error))

	// 	})
	// }






// MEDIA

	createMedia(media, ext) {
		return new Promise((resolve, reject) => {

			//TODO - Validate media with 3rd party service
			//		 to detect image manipulation, etc...

			// Register media on ledger
			const mediaAccount = this.ledger.path.forMedia(media)
			const mediaAddress = mediaAccount.getAddress()

			// Generate file record
			const mediaPayload = {
				record: "media",
				type: "image", 		//TODO - Handle gifs/videos/audio
				address: mediaAddress,
				ext: ext,
				owner: this.address
			}

			// Register media on ledger
			//TODO - Check if media already exists and skip
			//		 this step, if required
			this.ledger.debugOut(`User-${this.address} is registering Media-${mediaAddress}`)
			this.ledger
				.storeRecord(this.identity, [mediaAccount], mediaPayload)
				.then(() => resolve(mediaAddress))
				.catch(error => reject(error))

		})
	}






// TOKENS

	createTransaction(to, value) {
		this.ledger.debugOut(`Sending ${value} POD from User-${this.address} to ${to}`)
		return new Promise(async (resolve, reject) => {

			// Ensure balance is up to date
			const balance = await this.getBalance(true)

			// Reject transactions with negative value
			if (value < 0) {
				reject(new PodiumError().withCode(7))

			// Ensure user has sufficient balance for this transaction
			} else if (value > balance) {
				reject(new PodiumError().withCode(6))

			// Otherwise, construct the payloads and transfer the funds
			} else {

				// Make sender record
				const senderAccount = this.ledger.path
					.forPODTransactionsOf(this.address)
				const senderRecord = {
					record: "transaction",
					type: "POD",
					value: -1 * value,
					to: to
				}

				// Make received record
				const receiverAccount = this.ledger.path
					.forPODTransactionsOf(to)
				const receiverRecord = {
					record: "transaction",
					type: "POD",
					value: value,
					from: this.address
				}

				// Carry out transaction
				this.ledger
					.storeRecords(
						this.identity,
						[senderAccount], senderRecord,
						[receiverAccount], receiverRecord
					)
					.then(() => resolve(fromJS(senderRecord)))
					.catch(reject)

			}

		})
	}





// TOPICS

	createTopic(
			id,				// Unique identifier for topic
			name,			// Display name of topic
			description		// Description of topic
		) {
		this.ledger.debugOut(`User-${this.address} is creating a new Topic with ID "${id}"`)
		return new Promise((resolve, reject) => {

			// Resolve topic address
			const topicAccount = this.ledger.path.forTopicWithID(id);
			const topicAddress = topicAccount.getAddress();

			// Build topic record
			const topicRecord = {
				record: "topic",
				type: "topic",
				id: id,
				name: name,
				description: description,
				owner: this.address,
				address: topicAddress
			}

			//TODO - Topic ownership record

			// Store topic
			this.ledger
				.storeRecord(this.identity, [topicAccount], topicRecord)
				//TODO - Add topic to index database
				.then(result => resolve(topicRecord))
				.catch(error => reject(error))

		})
	}





// POSTS

	createPost(
			text,					// Content of new post
			references = {},		// References contained in new post
			parentAddress = null,	// Address of post being replied to (if any)
		) {
		this.ledger.debugOut(`User-${this.address} is posting: "${text}"`)
		return new Promise(async (resolve, reject) => {

			// Load balance and calculate post cost
			const cost = postCost(text)
			const balance = await this.getBalance(true)

			// Load parent post
			let parent;
			if (parentAddress) {
				parent = await this.ledger.post(parentAddress).content()
			}

			// Validate text string
			if (!text || text === "") {
				reject(new PodiumError().withCode(4))

			// Validate parent post
			} else if (parentAddress && !parent) {
				reject(new PodiumError().withCode(5))

			// Ensure user has enough balance to pay for post
			} else if (cost > balance) {
				reject(new PodiumError().withCode(6))

			} else {

				//TODO - Upload media

				// Build post accounts
				//TODO - Fix deterministic posting addresses
				//const postAccount = this.path.forNextPostBy(this.state.data.get("user"));
				const postAccount = this.ledger.path.forNewPost(text);
				const postAddress = postAccount.getAddress();

				// Unpack references
				const mentions = references.mentions || []

				// Handle long posts
				const textList = chunkText(text, 128)

				// Build post record
				const postRecord = {

					text: textList[0],
					cost: cost,

					entry: 0,
					entries: textList.length,

					address: postAddress,

					author: this.address,
					parent: (parent) ? parentAddress : null,
					// parentAuthor: (parent) ? parent.get("author") : null,
					// grandparent: (parent) ? parent.get("parent") : null,

					origin: (parent) ? parent.get("origin") : postAddress,
					depth: (parent) ? parent.get("depth") + 1 : 0,
					// chain: (parent && parent.get("author") === this.address) ?
					// 	parent.get("chain") + 1 : 0, 

					mentions: mentions,

				}

				// Build destination accounts for index record
				const indexAccount = this.ledger.path.forPostsBy(this.address)
				const indexRecord = {
					address: postAddress
				}

				// Build transaction record
				const transactionAccount = this.ledger.path.forPODTransactionsOf(this.address)
				const transactionRecord = {
					type: "POD",
					to: postAddress,
					for: "post",
					value: -1 * cost
				}

				// Build placeholder records for replies
				const placeholderAccounts = [
					this.ledger.path.forRepliesToPost(postAddress)
				]
				const placeholderRecord = {
					placeholder: true
				}

				// Write main post records
				var postWrite = this.ledger.storeRecords(
					this.identity,
					[transactionAccount], transactionRecord,
					[postAccount], postRecord,
					[indexAccount], indexRecord,
					placeholderAccounts, placeholderRecord
				)

				
				// Write additional post entries, if required
				let entryWrite = []
				if (textList.length > 1) {
					entryWrite = List(textList)
						.rest()
						.map((t, i) => this.ledger.storeRecord(
							this.identity,
							[postAccount],
							{
								entry: i + 1,
								entries: textList.size,
								text: t
							}
						))
						.toJS()
				}

				//TODO - Mentions, Topics (and other references, etc...)

				// Handle reply records
				let replyWrite;
				if (parent) {

					// Build reply index
					const replyAccount = this.ledger.path
						.forRepliesToPost(parentAddress)

					// Store records in ledger
					replyWrite = this.ledger.storeRecord(
						this.identity, [replyAccount], indexRecord
					)

				} 

				// Wait for all writes to complete
				Promise
					.all([postWrite, ...entryWrite, replyWrite])
					.then(() => resolve(postRecord))
					.catch(reject)

			}

		});

	}


	promotePost(
			postAddress,	// Address of the promoted post
			authorAddress	// Address of the post's author
		) {
		this.ledger.debugOut(`User-${this.address} is promoting Post-${postAddress}`)
		return new Promise((resolve, reject) => {

			//TODO - Ensure user has sufficient balance

			// Get account for the promoting user's posts
			const postAccount = this.ledger.path.forPostsBy(this.address)
			const postRecord = {
				record: "post",
				type: "promotion",
				address: postAddress
			}

			// Get account for logging promotions of target post
			const promoteAccount = this.ledger.path.forPromosOfPost(postAddress)
			const promoteRecord = {
				record: "post",
				type: "promotion",
				address: postAddress,
				by: this.address
			}

			// Build transaction record
			const transactionAccount = this.ledger.path.forPODTransactionsOf(this.address)
			const transactionRecord = {
				record: "transaction",
				type: "POD",
				to: postAddress,
				for: "promotion",
				value: 25
			}

			// Store records in ledger
			this.ledger.storeRecords(
					this.identity,
					[postAccount], postRecord,
					[promoteAccount], promoteRecord,
					[transactionAccount], transactionRecord
				)
				.then(result => resolve(fromJS(postRecord)))
				.catch(error => reject(error))

		});

	}


	amendPost() {}


	retractPost() {}





// REPORTING

	createReport() {}






// FOLLOWING


	follow(address) {
		this.ledger.debugOut(`User-${this.address} is following User-${address}`)
		return new Promise((resolve, reject) => {

			// Check user is not currently following the user to be followed
			this.isFollowing(address, true)
				.then(followed => {
					if (!followed) {

						// Build follow account payload
						const followAccount = this.ledger.path
							.forUsersFollowing(address)
						const followRecord = {
							record: "follower",
							type: "index",
							address: this.address,
							status: true
						}

						// Build following payload
						const followingAccount = this.ledger.path
							.forUsersFollowedBy(this.address)
						const followingRecord = {
							record: "following",
							type: "index",
							address: address,
							status: true
						}

						// Store following record
						this.ledger.storeRecords(
								this.identity,
								[followAccount], followRecord,
								[followingAccount], followingRecord
							)
							.then(() => resolve(this))
							.catch(error => reject(error))

					} else {
						resolve(this)
					}
				})
				.catch(error => reject(error))

		})

	}


	unfollow(address) {
		this.ledger.debugOut(`User-${this.address} is unfollowing User-${address}`)
		return new Promise((resolve, reject) => {

			// Check user is currently following the user to be unfollowed
			this.isFollowing(address, true)
				.then(followed => {
					if (followed) {

						// Build follow account payload
						const followAccount = this.ledger.path
							.forUsersFollowing(address)
						const followRecord = {
							record: "follower",
							type: "index",
							address: this.address,
							status: false
						}

						// Build following payload
						const followingAccount = this.ledger.path
							.forUsersFollowedBy(this.address)
						const followingRecord = {
							record: "following",
							type: "index",
							address: address,
							status: false
						}

						// Store following record
						this.ledger.storeRecords(
								this.identity,
								[followAccount], followRecord,
								[followingAccount], followingRecord
							)
							.then(() => resolve(this))
							.catch(error => reject(error))

					} else {
						resolve(this)
					}
				})
				.catch(error => reject(error))

		})
	}


}





// export class PodiumServerActiveUser extends PodiumActiveUser {




// // ALERTS

// 	alerts(seen=false, limit=25) {
// 		this.debugOut(`Fetching alerts for User-${this.address}`)
// 		return new Promise((resolve, reject) => {
// 			let finder;
// 			if (seen) {
// 				finder = {
// 					to: this.address
// 				}
// 			} else {
// 				finder = {
// 					to: this.address,
// 					seen: false
// 				}
// 			}
// 			const alerts = this.podium.db
// 				.getCollection("alerts")
// 				.chain()
// 				.find(finder)
// 				.simplesort("created", { desc: true })
// 				.limit(limit)
// 				.data()
// 			resolve(fromJS(alerts).valueSeq().toList())
// 		})
// 	}


// 	createAlert(type, userAddress, about) {
// 		if (userAddress !== this.address) {
// 			this.debugOut(`Creating a "${type}"" Alert for User-${userAddress} ` +
// 						  `from User-${this.address}` +
// 						  `${about ? ` about ${about}` : ""}`)
// 			const created = (new Date()).getTime()
// 			this.podium.db
// 				.getCollection("alerts")
// 				.insert({
// 					created: created,
// 					to: userAddress,
// 					from: this.address,
// 					type: type,
// 					about: about,
// 					seen: false,
// 					key: `${this.address}${userAddress}${type}${created}`
// 				})
// 			this.podium.db.saveDatabase()
// 		}
// 	}


// 	clearAlerts(keys) {
// 		this.debugOut(`Clearing Alerts [${keys.toJS()}] for User-${this.address}`)
// 		this.podium.db
// 			.getCollection("alerts")
// 			.chain()
// 			.find({
// 				to: { '$eq': this.address },
// 				key: { '$in': keys.toJS() }
// 			})
// 			.update(item => {
// 				item.seen = true
// 			})
// 	}




// // ALERT-SENDING WRAPPERS FOR CREATION METHODS

// 	createTransaction(to, value) {
// 		return new Promise((resolve, reject) => {
// 			PodiumActiveUser.prototype.createTransaction
// 				.call(this, to, value)
// 				.then(resolve)
// 				.catch(reject)
// 		})
// 	}


// 	createPost(
// 			text,
// 			references = Map(),
// 			parentAddress = null
// 		) {
// 		return new Promise((resolve, reject) => {
// 			PodiumActiveUser.prototype.createPost
// 				.call(this, text, references, parentAddress)
// 				.then(post => {

// 					// Alert mentions
// 					if (references.get("mentions")) {
// 						references
// 							.get("mentions")
// 							.map(mention => {
// 								this.createAlert(
// 									"mention",
// 									mention,
// 									post.address
// 								)
// 							})
// 					}

// 					// Alert reply
// 					let replyAlert;
// 					if (parentAddress) {
// 						this.podium
// 							.post(parentAddress)
// 							.content()
// 							.then(content => {
// 								this.createAlert(
// 									"reply",
// 									content.get("author"),
// 									post.address
// 								)
// 								resolve(post)
// 							})
// 							.catch(error => reject(error))
// 					} else {
// 						resolve(post)
// 					}

// 				})
// 				.catch(error => reject(error))
// 		})
// 	}


// 	follow(address) {
// 		return new Promise((resolve, reject) => {
// 			PodiumActiveUser.prototype.follow.call(this, address)
// 				.then(() => {
// 					this.createAlert("follow", address)
// 					resolve(this)
// 				})
// 				.catch(error => reject(error))
// 		})
// 	}




// }




// export class PodiumClientActiveUser extends PodiumClientUser {
	

// 	constructor(podium, identity) {
// 		super(podium, identity.account.getAddress())
// 		this.identity = identity
// 	}



// // ALERTS

// 	alerts(seen=false, limit=25, force=false) {
// 		this.debugOut(`Fetching alerts for User-${this.address}`)
// 		return new Promise(async (resolve, reject) => {
// 			if (!force && this.cache.is("alerts")) {
// 				resolve(this.cache.get("alerts"))
// 			} else {
// 				this.podium
// 					.dispatch(
// 						"/alerts",
// 						{ limit: limit, seen: seen },
// 						this.identity
// 					)
// 					.then(response => {
// 						const alerts = response.get("alerts").toList()
// 						this.cache.swap("alerts", alerts)
// 						resolve(alerts)
// 					})
// 					.catch(error => reject(error))
// 			}
// 		})
// 	}


// 	clearAlerts(keys) {
// 		this.debugOut(`Clearing alerts [${keys.toJS()}] for User-${this.address}`)
// 		return new Promise(async (resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/clearalerts",
// 					{ keys: JSON.stringify(keys.toJS()) },
// 					this.identity
// 				)
// 				.then(() => resolve())
// 				.catch(error => reject(error))
// 		})
// 	}





// // ACCOUNT UPDATING

// 	updateUserIdentifier() {}

// 	updatePassword() {}





// // USER PROFILES

// 	updateProfileName(name) {
// 		this.debugOut(`Updating profile name: ${name}`)
// 		return new Promise(async (resolve, reject) => {
			
// 			// DISPATCH

// 		})
// 	}

// 	updateProfileBio(bio) {
// 		this.debugOut(`Updating profile bio: ${bio}`)
// 		return new Promise(async (resolve, reject) => {
			
// 			// DISPATCH

// 		})
// 	}

// 	updateProfilePicture(pictureAddress) {
// 		this.debugOut(`Updating profile picture: ${pictureAddress}`)
// 		return new Promise(async (resolve, reject) => {
			
// 			// DISPATCH

// 		})
// 	}






// // MEDIA

// 	createMedia(image, ext) {
// 		return new Promise((resolve, reject) => {

// 			// DISPATCH

// 		})
// 	}




// // TOKENS

// 	createTransaction(to, value) {
// 		return new Promise((resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/transaction",
// 					{
// 						to: to,
// 						value: value
// 					},
// 					this.identity
// 				)
// 				.then(transaction => {
// 					this.cache.append("transactions", transaction)
// 					resolve(transaction)
// 				})
// 				.catch(reject)
// 		})
// 	}


// 	requestFunds(value) {
// 		return new Promise((resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/faucet",
// 					{ value: value },
// 					this.identity
// 				)
// 				.then(transaction => {
// 					this.cache.append("transactions", transaction)
// 					resolve(transaction)
// 				})
// 				.catch(reject)
// 		})
// 	}




// // TOPICS

// 	createTopic(
// 			id,				// Unique identifier for topic
// 			name,			// Display name of topic
// 			description		// Description of topic
// 		) {
// 		this.debugOut(`Creating Topic: ${id}`)
// 		return new Promise((resolve, reject) => {

// 			// DISPATCH

// 		})
// 	}





// // POSTS

// 	createPost(
// 			text,
// 			references = Map(),
// 			parentAddress = null
// 		) {
// 		this.debugOut(`User ${this.address} is posting: "${text}"`)
// 		return new Promise(async (resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/post",
// 					{
// 						text: text,
// 						references: JSON.stringify(references.toJS()),
// 						parentAddress: parentAddress
// 					},
// 					this.identity
// 				)
// 				.then(response => {
// 					const postAddress = response.get("address")
// 					var post = this.podium.post(postAddress, this.address)
// 					this.cache.add("posts", postAddress)
// 					resolve(post)
// 				})
// 				.catch(error => reject(error))
// 		})
// 	}


// 	promotePost(
// 			postAddress,	// Address of the promoted post
// 			authorAddress	// Address of the post's author
// 		) {
// 		this.debugOut(`Promoting Post ${postAddress}`)
// 		return new Promise((resolve, reject) => {

// 			// DISPATCH

// 		});

// 	}


// 	amendPost() {}


// 	retractPost() {}





// // REPORTING

// 	createReport() {}






// // FOLLOWING

// 	follow(address) {
// 		this.debugOut(`User-${this.address} is following User-${address}`)
// 		return new Promise((resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/follow",
// 					{ address: address },
// 					this.identity
// 				)
// 				.then(() => {
// 					this.cache.add("following", address)
// 					resolve(this)
// 				})
// 				.catch(error => reject(error))
// 		})
// 	}

// 	unfollow(address) {
// 		this.debugOut(`User-${this.address} is unfollowing User-${address}`)
// 		return new Promise((resolve, reject) => {
// 			this.podium
// 				.dispatch(
// 					"/unfollow",
// 					{ address: address },
// 					this.identity
// 				)
// 				.then(() => {
// 					this.cache.remove("following", address)
// 					resolve(this)
// 				})
// 				.catch(error => reject(error))
// 		})
// 	}




// }





