import http from 'http';
import express from 'express';
import socketio from 'socket.io';
import { v4 as uuid } from 'uuid';
import s3 from 'aws-sdk/clients/s3';

import { fromJS, Map } from 'immutable';

import Database from './db/database';

import Ledger from './ledger/ledger';
import LedgerError from './ledger/ledgerError';




// Retrieve config from S3
export default class Podium {


	constructor() {

		// S3 file store
		this.bucket = "podium-config"
		this.store = new s3({
			apiVersion: '2006-03-01',
			region: 'eu-west-1',
			accessKeyId: process.env.AWS_ACCESS_KEY,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
		})

		// Data on the current network
		this.network = null;

		// Current status of the network
		this.status = "Offline";

		// Root user for the ledger
		this.rootUser = null;

		// Constitution data
		this.constitution = null;

		// Sessions
		this.sessions = Map()
		this.feeds = Map()


		this.initAccounts = this.initAccounts.bind(this)


		// Methods
		this.newSession = this.newSession.bind(this)

		this.checkUser = this.checkUser.bind(this)
		this.search = this.search.bind(this)

		this.createUser = this.createUser.bind(this)

		this.sellIdentity = this.sellIdentity.bind(this)
		this.buyIdentity = this.buyIdentity.bind(this)

		this.keyInUser = this.keyInUser.bind(this)
		this.signInUser = this.signInUser.bind(this)
		this.signOutUser = this.signOutUser.bind(this)

		this.getProfile = this.getProfile.bind(this)
		this.updateProfile = this.updateProfile.bind(this)

		this.followUser = this.followUser.bind(this)
		this.unfollowUser = this.unfollowUser.bind(this)
		this.indexFollowers = this.indexFollowers.bind(this)
		this.indexFollowing = this.indexFollowing.bind(this)

		this.openFeed = this.openFeed.bind(this)
		this.subcribe = this.subscribe.bind(this)
		this.closeFeed = this.closeFeed.bind(this)
		this.unsubscribe = this.unsubscribe.bind(this)

		this.createPost = this.createPost.bind(this)
		this.indexPosts = this.indexPosts.bind(this)
		this.getPost = this.getPost.bind(this)
		this.amendPost = this.amendPost.bind(this)
		this.retractPost = this.retractPost.bind(this)
		this.promotePost = this.promotePost.bind(this)

		this.getPDMTransactions = this.getPDMTransactions.bind(this)
		this.getADMTransactions = this.getADMTransactions.bind(this)

		this.createTopic = this.createTopic.bind(this)
		this.indexTopics = this.indexTopics.bind(this)
		this.getTopic = this.getTopic.bind(this)
		this.updateTopic = this.updateTopic.bind(this)
		this.sellTopic = this.sellTopic.bind(this)
		this.buyTopic = this.buyTopic.bind(this)

		this.createPod = this.createPod.bind(this)
		this.indexPods = this.indexPods.bind(this)
		this.getPod = this.getPod.bind(this)
		this.updatePod = this.updatePod.bind(this)
		this.sellPod = this.sellPod.bind(this)
		this.buyPod = this.buyPod.bind(this)

		this.react = this.react.bind(this)
		this.getAffinity = this.getAffinity.bind(this)

		this.createReport = this.createReport.bind(this)
		this.indexReports = this.indexReports.bind(this)
		this.getReport = this.getReport.bind(this)
		this.voteReport = this.voteReport.bind(this)

		this.indexSanctions = this.indexSanctions.bind(this)
		this.getSanction = this.getSanction.bind(this)
		this.indexRights = this.indexRights.bind(this)
		this.getRight = this.getRight.bind(this)
		this.updateRights = this.updateRights.bind(this)

		this.getIntegrity = this.getIntegrity.bind(this)

		this.indexTransactions = this.indexTransactions.bind(this)
		this.createTransaction = this.createTransaction.bind(this)

		this.indexNotifications = this.indexNotifications.bind(this)
		this.clearNotification = this.clearNotification.bind(this)
		this.clearAllNotifications = this.clearAllNotifications.bind(this)

	}



// S3 HELPERS

	fromStore(key) {
		return new Promise((resolve, reject) => {
			this.store
				.getObject({
					Bucket: this.bucket,
					Key: `${key}.json`
				})
				.promise()
				.then(item => resolve(
					fromJS(JSON.parse(item.Body.toString('utf-8')))
				))
				.catch(error => {
					if (error.code = "NoSuchKey") {
						resolve(null)
					} else {
						reject()
					}
				})
		})
	}

	toStore(key, obj) {
		return new Promise((resolve, reject) => {
			this.store
				.putObject({
					Bucket: this.bucket,
					Key: `${key}.json`,
					Body: JSON.stringify(obj.toJS()),
					ContentType: "json"
				})
				.promise()
				.then(() => resolve(obj))
				.catch(reject)
		})
	}

	mediaFromStore(key) {
		return new Promise((resolve, reject) => {
			this.store
				.getObject({
					Bucket: this.config.getIn(["Store", "Media"]),
					Key: key
				})
				.promise()
				.then(item => resolve(item.Body))
				.catch(error => {
					if (error.code = "NoSuchKey") {
						resolve(null)
					} else {
						reject()
					}
				})
		})
	}

	mediaToStore(key, image, ext="png") {
		return new Promise((resolve, reject) => {
			this.store
				.putObject({
					Bucket: this.config.getIn(["Store", "Media"]),
					Key: `${key}.${ext}`,
					Body: Buffer.from(image, "base64"),
					ContentType: `image/${ext}`
				})
				.promise()
				.then(() => resolve(key))
				.catch(reject)
		})
	}




// SETUP & RESUME

	load(clean = false) {
		return new Promise((resolve, reject) => {
			this.fromStore("config")
				.then(config => {
					console.log("   * Loaded Config file")
					this.config = config
					return Promise.all([
						this.fromStore("live"),
						this.fromStore("constitution")
					])
				})
				.then(([networkID, constitution]) => {

					console.log("   * Loaded Network file")
					console.log("   * Loaded Constitution file")

					// Store the constitution data
					this.constitution = constitution

					// Load network data
					if (networkID && clean) {

						// Unpack network ID
						const id = networkID.get("ID")
						const subversion = parseInt(id.split("|").splice(-1,1)) + 1
						console.log(` - Creating Network iteration ${subversion} from ${id}`)

						// Create new network version
						return this.newNetwork(subversion)
					
					} else if (networkID) {

						// Unpack latest network ID
						const id = networkID.get("ID")
						console.log(` - Resuming Network: ${id}`)

						// Load last network version
						return this.loadNetwork(id)

					} else {

						console.log(" - Creating new Network")

						// Create new network
						return this.newNetwork()

					}

				})
				.then(resolve)
				.catch(reject)
		})
	}



	newNetwork(subversion=0) {
		return new Promise((resolve, reject) => {

			// Generate new network ID
			const id = [
				this.config.getIn(["App", "Name"]),
				this.config.getIn(["App", "Type"]),
				...this.config.getIn(["App", "Flags"]),
				this.config.getIn(["App", "Version"]),
				subversion
			].join("|")
			const key = uuid()
			this.network = Map({
				ID: id,
				Created: new Date().getTime(),
				Key: key,
				Launched: false
			})
			console.log(`   * New Network ID: ${id}`)
			console.log(`   * New Network Key: ${key}`)

			// Store network
			Promise
				.all([

					// Set this as the currently live network
					this.toStore("live", Map({ ID: id })),

					// Store the network data
					this.toStore(`networks/${id}`, this.network)

				])
				.then(resolve)
				.catch(reject)

		})
	}


	loadNetwork(networkID) {
		return new Promise((resolve, reject) => {
			this.fromStore(`networks/${networkID}`)
				.then(network => {
					if (!network) {
						reject(`Network "${this.networkID}" not found`)
					} else {
						this.network = network
						resolve()
					}
				})
				.catch(reject)
		})
	}



	launch(clean = false) {
		return new Promise((resolve, reject) => {

			console.log("LAUNCHING PODIUM SERVER")

			// Set status
			this.status = "Loading Configuration"
			console.log(" - Loading Configuration")

			// Load config from S3
			this.load(clean)

				// Launch services
				.then(() => {

					// Log progress
					this.status = "Launching Services"
					console.log(" - Launching Services")

					// Make services
					const port = this.config.getIn(["Server", "Port"])
					this.web = express()
					let server = http.Server(this.web)

					let ledger = new Ledger(
						this.config.get("Ledger"),
						this.network
					)

					let database = new Database(
						this.config.get("Database"),
						this.network
					)

					// Launch the server, ledger, and database
					return Promise.all([

						// Launch server
						new Promise(res => server
							.listen(
								port,
								() => {
									console.log(`   * Serving port ${port}`)
									res(server)
								}
							)
						),

						// Connect to Radix
						ledger
							.connect()
							.then(l => {
								console.log("   * Connected to Radix")
								return l
							}),

						// Build database
						database
							.build()
							.then(d => {
								console.log("   * Connected to Database")
								return d 
							})

					])

				})

				// Store services
				.then(([server, ledger, db]) => {

					// Log progress
					this.status = "Configuring Ledger"
					console.log(" - Configuring Ledger")

					// Store services
					this.server = server
					this.ledger = ledger
					this.db = db

					// Find root user account
					if (this.network.get("Launched")) {
						return this.resumeNation()
					} else {
						return this.newNation()
					}

				})

				// Open websocket
				.then(() => {
					
					// Log progress
					this.status = "Opening Websocket"
					console.log(" - Opening Websocket")

					// Create simple server
					this.web.get("/", (_, response) => {
						response.send("Podium Server Online!")
					})

					// Create websocket service
					this.websocket = socketio(this.server)

					// Accept new connections
					this.websocket.on(
						'connection',
						socket => this.newSession(socket)
					)

					// Handle failed connections
					//TODO

					// Log success
					console.log("PODIUM SERVER ONLINE")
					this.status = "Live";
					resolve()

				})

				// Handle errors
				.catch(reject)

		})
	}


	newNation() {
		return new Promise((resolve, reject) => {

			// Unpack root credentials
			const rootID = this.config.getIn(["App", "RootUser", "ID"])
			const rootKey = this.network.get("Key")

			// Create the root user
			this.ledger
				.createUser(rootID, rootKey)
				.then(({ keyPair, address }) => this.ledger
					.user(address)
					.keyIn(keyPair, rootKey)
				)

				// Sign in root user, if already created
				.catch(error => {
					if (error instanceof LedgerError && error.code === 3) {
						return this.ledger
							.user()
							.signIn(rootID, rootKey)
					} else {
						reject(error)
					}
				})

				// Store the root user and mint Podium
				.then(({ user }) => {

					// Add user to database
					this.db.addUser(rootID, user.address)

					// Store root user
					this.rootUser = user
					console.log("   * Created Root User")

					// Unpack profile data
					const rootName = this.config.getIn(["App", "RootUser", "Name"])
					const rootBio = this.config.getIn(["App", "RootUser", "Bio"])
					const rootPost = this.config.getIn(["App", "RootUser", "FirstPost"])
					const rootPicture = this.config.getIn(["App", "RootUser", "Picture"])
					const extn = rootPicture.split(".")[1]

					// Set up initial ledger configuration
					return Promise.all([

						// Mint Podium
						this.ledger
							.mint(
								this.config.getIn(["App", "InitialMint"]),
								this.rootUser.identity
							)
							.then(() => {
								console.log("   * Minted Initial POD")
								return
							}),

						// Make initial post
						this.rootUser
							.createPost(rootPost)
							.then(() => {
								console.log("   * Created First Post from Root")
								return
							}),

						// Set up root profile
						this.mediaFromStore(`reserved/${rootPicture}`)
							.then(picture => this.registerMedia(
								this.rootUser, picture, extn
							))
							.then(picAddress => {
								const profile = {
									name: rootName,
									bio: rootBio,
									picture: picAddress,
									pictureType: extn
								}
								return this.rootUser
									.updateProfile(profile)
							})
							.then(() => {
								console.log("   * Created Root Profile")
								return
							}),

						// Create Governance
						this.ledger
							.createDomain(
								this.constitution,
								this.rootUser.identity
							)
							.then(() => {
								console.log("   * Created Root Domain")
								return
							})

					])

				})

				// Create reserved accounts
				.then(this.initAccounts)

				// Save network as launched
				.then(() => {
					console.log(" - Updating Network File")
					this.network = this.network.set("Launched", true)
					return this.toStore(
						`networks/${this.network.get("ID")}`,
						this.network
					)
				})

				// Return
				.then(resolve)
				.catch(reject)

		})
	}


	resumeNation() {
		return new Promise((resolve, reject) => {
			this.ledger

				// Sign-in root user
				.user()
				.signIn(
					this.config.getIn(["App", "RootUser", "ID"]),
					this.network.get("Key")
				)

				// Store root user and return
				.then(({ user }) => {
					console.log("   * Root User Signed-In")
					this.rootUser = user
					resolve()
				})
				.catch(reject)

		})
	}



// RESERVED ACCOUNTS

	initAccounts() {
		return new Promise((resolve, reject) => {
			console.log(" - Creating Reserved Accounts")
			this.fromStore("accounts")
				.then(accounts => Promise.all(
					accounts.map(account => {

						// Unpack account
						const identity = account.get("identity")
						const passphrase = account.get("passphrase")
						const profile = account.get("profile").toJS()
						const picture = profile.picture
						const extn = picture ? picture.split(".")[1] : null
						const post = account.get("post")

						// Create account
						return this.ledger

							// Create user
							.createUser(identity, passphrase)
							
							// Sign-in and pre-emptively load profile picture
							.then(({ keyPair, address }) => {
								this.db.addUser(identity, address)
								return Promise.all([
									this.ledger
										.user()
										.keyIn(keyPair, passphrase),
									picture ?
										this.mediaFromStore(`reserved/${picture}`)
										: null
								])
							})

							// Follow root account, create initial post,
							// register profile picture, and update profile
							.then(([ { user }, pic ]) => Promise.all([

								// Follow the root user
								user.follow(this.rootUser.address),

								// Create first post, if provided
								post ? user.createPost(post) : null,

								// Create profile
								picture ?
									this.registerMedia(user, pic, extn)
										.then(address => {
											profile.picture = address
											profile.pictureType = extn
											return user.updateProfile(profile)
										})
									:
									user.updateProfile(profile)

							]))

							// Report success
							.then(() => {
								console.log(`   * Created @${identity}`)
							})

							// Handle errors
							.catch(console.error)

					})
				))
				.then(resolve)
				.catch(reject)
		})
	}



// MEDIA STORAGE

	registerMedia(user, media, ext="png") {
		return new Promise((resolve, reject) => user
			.createMedia(media, ext)
			.then(address => this.mediaToStore(address, media, ext))
			.then(resolve)
			.catch(reject)
		)
	}




// WEBSOCKET HANDLERS

	newSession(socket) {

		// Log new connection
		const pre = `   [${socket.id}] -`
		console.log(`${pre} new connection`)
		socket.emit("connection", true)

		function newTask(fn, retry=1, auth=false) {
			return async (data, done) => {

				// Ensure user is authenticated, if required
				let user = this.sessions.get(socket.id)
				if (auth && !user) {
					done({ error: "User not authenticated" })
				} else {

					// Make client updater
					const session = {
						id: socket.id,
						user: user,
						channel: response => socket.emit(
							data.task,
							response
						),
						toClient: msg => socket.emit(
							data.task,
							{ update: msg }
						)
					}
					session.toClient("Accepted")

					// Log activity
					console.log(`${pre} task: ${fn.name}(${JSON.stringify(data.args)})`)

					// Perform task
					let output;
					let attempts = 0;
					while (!output) {
						output = await new Promise(resolve => {

							// Run task
							fn(data.args, session)

								// Return result
								.then(result => {
									console.log(
										`${pre} result: ${fn.name} =>` +
										` ${JSON.stringify(result)}`
									)
									resolve({ result: result })
								})

								// Handle errors and retry
								.catch(error => {
									if (error instanceof LedgerError
											&& error.code === 2
											&& attempts < retry) {
										attempts = attempts + 1
										console.log(
											`${pre} timed out: ${fn.name} =>` +
											` retrying [${attempts}/${retry}]`
										)
										resolve(false)
									} else {
										console.log(
											`${pre} failed: ${fn.name}` +
											` => ${error.message}`
										)
										resolve({ error: error })
									}
								})

						})
					}

					// Return result
					done(output)

				}

			}
		}
		newTask = newTask.bind(this)


		// Search
		socket.on("check user", newTask(this.checkUser))
		socket.on("search", newTask(this.search))

		// Create users
		socket.on("create user", newTask(this.createUser))
		socket.on("sell identity", newTask(this.sellIdentity))
		socket.on("buy identity", newTask(this.buyIdentity))

		// Sign-in/out users
		socket.on("key in", newTask(this.keyInUser, 3))
		socket.on("sign in", newTask(this.signInUser, 3))
		socket.on("sign out", newTask(this.signOutUser))

		// Profile
		socket.on("load profile", newTask(this.getProfile))
		socket.on("update profile", newTask(this.updateProfile, 0, true))

		// Follow users
		socket.on("follow", newTask(this.followUser, 0, true))
		socket.on("unfollow", newTask(this.unfollowUser, 0, true))
		socket.on("index followers", newTask(this.indexFollowers))
		socket.on("index following", newTask(this.indexFollowing))

		// Feed
		socket.on("feed", newTask(this.openFeed))
		socket.on("close feed", newTask(this.closeFeed))

		// Posts
		socket.on("create post", newTask(this.createPost, 0, true))
		socket.on("index posts", newTask(this.indexPosts))
		socket.on("load post", newTask(this.getPost))
		socket.on("amend post", newTask(this.amendPost, 0, true))
		socket.on("retract post", newTask(this.retractPost, 0, true))
		socket.on("promote post", newTask(this.promotePost, 0, true))

		// Tokens
		socket.on("load PDM", newTask(this.getPDMTransactions))
		socket.on("load ADM", newTask(this.getADMTransactions))

		// Topics
		socket.on("create topic", newTask(this.createTopic, 0, true))
		socket.on("index topics", newTask(this.indexTopics))
		socket.on("load topic", newTask(this.getTopic))
		socket.on("update topic", newTask(this.updateTopic, 0, true))
		socket.on("sell topic", newTask(this.sellTopic, 0, true))
		socket.on("buy topic", newTask(this.buyTopic, 0, true))

		// Pods
		socket.on("create pod", newTask(this.createPod, 0, true))
		socket.on("index pods", newTask(this.indexPods))
		socket.on("load pod", newTask(this.getPod))
		socket.on("update pod", newTask(this.updatePod))
		socket.on("sell pod", newTask(this.sellPod))
		socket.on("buy pod", newTask(this.buyPod))

		// React
		socket.on("reaction", newTask(this.react, 0, true))
		socket.on("load affinity", newTask(this.getAffinity, 0, true))

		// Reporting
		socket.on("create report", newTask(this.createReport, 0, true))
		socket.on("index reports", newTask(this.indexReports))
		socket.on("load report", newTask(this.getReport))
		socket.on("vote report", newTask(this.voteReport, 0, true))

		// Sanctions
		socket.on("index sanctions", newTask(this.indexSanctions))
		socket.on("load sanction", newTask(this.getSancton))

		// Rights
		socket.on("index rights", newTask(this.indexRights))
		socket.on("load right", newTask(this.getRight))
		socket.on("update rights", newTask(this.updateRights, 0, true))

		// Integrity
		socket.on("load integrity", newTask(this.getIntegrity))

		// Tokens
		socket.on("index transactions", newTask(this.indexTransactions))
		socket.on("load transaction", newTask(this.getTransaction))
		socket.on("create transaction", newTask(this.createTransaction, 0, true))

		// Notification
		socket.on("index notifications", newTask(this.indexNotifications, 0, true))
		socket.on("load notification", newTask(this.getNotification, 0, true))

	}




// SEARCH

	search(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { target, among } = args
			session.toClient(`Searching for ${target}`)

			// Perform search
			let results = this.db.search(target, among)
			resolve({ results: results })

		})
	}


	checkUser(args, session) {
		return new Promise(resolve => {
			const check = this.db.getUser(args.target)
			resolve({ address: check })
		})
	}



// REGISTRATION

	createUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { identity, passphrase } = args;
			
			// Store user on ledger
			session.toClient("Creating User")
			this.ledger
				.createUser(identity, passphrase)
				.then(({ keyPair, address }) => {

					// Store user in database
					session.toClient("Storing User")
					this.db.addUser(identity, address)

					// Return address and keypair
					resolve({
						keyPair: keyPair,
						address: address
					})

				})
				.catch(reject)

		})
	}


	sellIdentity(args, session) {
		return new Promise((resolve, reject) => {

		})
	}


	buyIdentity(args, session) {
		return new Promise((resolve, reject) => {

		})
	}






// AUTHENTICATION

	keyInUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { keyPair, passphrase } = args;
			session.toClient("Keying In")

			// Sign in
			this.ledger
				.user()
				.keyIn(keyPair, passphrase)
				.then(({ user }) => {
					this.sessions = this.sessions.set(session.id, user)
					resolve({
						address: user.address,
						keyPair: keyPair
					})
				})
				.catch(reject)

		})
	}

	signInUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { identity, passphrase } = args;
			session.toClient("Signing In")

			// Sign in
			this.ledger
				.user()
				.signIn(identity, passphrase)
				.then(({ user, keyPair }) => {
					this.sessions = this.sessions.set(session.id, user)
					resolve({
						address: user.address,
						keyPair: keyPair
					})
				})
				.catch(reject)

		})
	}


	signOutUser(args, session) {
		return new Promise((resolve, reject) => {
			this.sessions.delete(session.id)
			resolve(true)
		})
	}


	getSession(id) {
		return this.sessions.get(id)
	}




// PROFILE

	getProfile(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { address } = args
			session.toClient(`Getting Profile of ${address}`)

			// Get profile
			this.ledger
				.user(address)
				.profile()
				.then(profile => resolve({ profile: profile }))
				.catch(reject)

		})
	}

	updateProfile(args, session) {
		return new Promise(async (resolve, reject) => {

			// Handle profile pictures
			if (args.picture) {
				args.picture = await this.registerMedia(
					session.user,
					args.picture,
					args.pictureExtn
				)
			}

			// Update profile
			session.user
				.updateProfile(args)
				.then(resolve)
				.catch(reject)

		})
	}




// FOLLOWING

	followUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { address } = args
			session.toClient(`Following ${address}`)

			// Follow user
			session.user
				.follow(address)
				.then(() => resolve(true))
				.catch(reject)

		})
	}


	unfollowUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { address } = args
			session.toClient(`Unfollowing ${address}`)

			// Unfollow user
			session.user
				.unfollow(address)
				.then(() => resolve(true))
				.catch(reject)

		})
	}


	indexFollowers(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { address } = args
			session.toClient(`Fetching Followers of ${address}`)

			// Retreive followers
			this.ledger
				.user(address)
				.followerIndex(address)
				.then(resolve)
				.catch(reject)

		})
	}


	indexFollowing(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { address } = args
			session.toClient(`Fetching Users Followed by ${session.user.address}`)

			// Retreive followers
			this.ledger
				.user(address)
				.followingIndex()
				.then(resolve)
				.catch(reject)

		})
	}




// FEED

	openFeed(args, session) {
		return new Promise((resolve, reject) => {

			// Subscribe to self
			this.subscribe(session.user.address, session)

			// Subscribe to followers
			session.user
				.followingIndex()
				.then(index => index.map(
					address => this.subscribe(address, session)
				))
				.then(resolve)
				.catch(reject)

		})
	}


	subscribe(address, session) {

		// Check if this user is already subscribed
		if (!this.feeds.get(address)) {
			let user = this.ledger.user(address)
			this.feeds = this.feeds
				.setIn([address, "subscribed"], 1)
				.setIn([address, "user"], user)
		} else {
			this.feeds = this.feeds.updateIn(
				[address, "subscribed"],
				s => s++
			)
		}

		// Subscribe this user
		this.feeds
			.getIn([address, "user"])
			.onPost(address => session.channel({
				post: address
			}))

	}
	

	closeFeed(args, session) {
		return new Promise((resolve, reject) => {

			// Unsubscribe self
			this.unsubscribe(session.user.address)

			// Unsubscribe from followed users
			session.user
				.followingIndex()
				.then(index => index.map(this.unsubscribe))
				.then(resolve)
				.catch(reject)

		})
	}


	unsubscribe(address) {

		// Reduce subscribers
		this.feeds = this.feeds.updateIn(
			[address, "subscribed"],
			s => s--
		)

		// Check if this user has no more subscribers
		if (this.feeds.getIn([address, "subscribed"]) <= 0) {
			this.feeds = this.feeds.delete(address)
		}

	}





// POSTS

	createPost(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { text, references, parent } = args
			session.toClient(`Creating Post: ${text}`)

			// Make post
			session.user
				.createPost(text, Map(references), parent)
				.then(resolve)
				.catch(reject)

		})
	}

	indexPosts(args, session) {
		return new Promise((resolve, reject) => {
			
			// Unpack request
			let { address } = args
			session.toClient(`Indexing Posts of ${address}`)

			// Retrieve post index for this user
			this.ledger
				.user(address)
				.postIndex()
				.then(resolve)
				.catch(reject)

		})
	}

	getPost({ address }, session) {
		return new Promise((resolve, reject) => {
			this.ledger
				.post(address)
				.content()
				.then(content => resolve({
					content: content
				}))
				.catch(reject)
		})
	}

	amendPost(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	retractPost(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	promotePost(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}




// TOKENS

	getPDMTransactions(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	getADMTransactions(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}




// TOPICS

	createTopic(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	indexTopics(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	getTopic(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	updateTopic(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	sellTopic(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}

	buyTopic(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}



// PODS

	createPod(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	indexPods(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	getPod(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	updatePod(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	sellPod(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}

	buyPod(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}



// BIAS

	react(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}

	getAffinity(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}



// REPORTS

	createReport(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	indexReports(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	getReport(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	voteReport(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}



// SANCTIONS

	indexSanctions(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	getSanction(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}



// RIGHTS

	getIntegrity(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	indexRights(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	getRight(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}

	updateRights(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}



// TRANSACTIONS
	
	indexTransactions(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	createTransaction(args, session) {
		return new Promise((resolve, reject) => {
			resolve({})
		})
	}



// NOTIFICATIONS

	indexNotifications(args, session) {
		return new Promise((resolve, reject) => {
			resolve([])
		})
	}

	clearNotification(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}

	clearAllNotifications(args, session) {
		return new Promise((resolve, reject) => {
			resolve(true)
		})
	}


}
