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

		// Methods
		this.newSession = this.newSession.bind(this)
		this.checkUser = this.checkUser.bind(this)
		this.createUser = this.createUser.bind(this)
		this.signInUser = this.signInUser.bind(this)
		this.signOutUser = this.signOutUser.bind(this)
		this.getProfile = this.getProfile.bind(this)

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

	mediaStore(key, image, ext="png") {
		return new Promise((resolve, reject) => {
			this.S3
				.putObject({
					Bucket: this.config.get("media"),
					Key: `${key}.${ext}`,
					Body: Buffer.from(image, "base64"),
					ContentType: `image/${ext}`
				})
				.promise()
				.then(resolve)
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
						const version = parseInt(id.split("|").splice(-1,1)) + 1
						console.log(` - Creating Network v${version} from ${id}`)

						// Create new network version
						return this.newNetwork(version)
					
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



	newNetwork(version=0) {
		return new Promise((resolve, reject) => {

			// Generate new network ID
			const id = [
				this.config.getIn(["App", "Name"]),
				this.config.getIn(["App", "Type"]),
				...this.config.getIn(["App", "Flags"]),
				version
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
					let server = http.Server(express())

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

			// Create the root user
			this.ledger
				.createUser(
					this.config.getIn(["App", "RootUser", "ID"]),
					this.network.get("Key"),
					this.config.getIn(["App", "RootUser", "Name"]),
					this.config.getIn(["App", "RootUser", "Bio"]),
				)

				// Sign in root user, if already created
				.catch(error => {
					if (error instanceof LedgerError && error.code === 3) {
						return this.ledger.user().signIn(
							this.config.getIn(["App", "RootUser", "ID"]),
							this.network.get("Key"),
						)
					} else {
						reject(error)
					}
				})

				// Store the root user and mint Podium
				.then(user => {

					// Add user to database
					this.db.addUser(
						this.config.getIn(["App", "RootUser", "ID"]),
						user.address
					)

					// Store root user
					this.rootUser = user
					console.log("   * Created Root User")

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
							.createPost(this.config.getIn(["App", "RootUser", "FirstPost"]))
							.then(() => {
								console.log("   * Created First Post")
								return
							}),

						// Create Governance
						this.ledger
							.createDomain(this.constitution, this.rootUser.identity)
							.then(() => {
								console.log("   * Created Root Domain")
								return
							})

					])

				})

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
				.then(user => {
					console.log("   * Root User Signed-In")
					this.rootUser = user
					resolve()
				})
				.catch(reject)

		})
	}




// WEBSOCKET HANDLERS

	newSession(socket) {

		// Log new connection
		const pre = `   [${socket.id}] -`
		console.log(`${pre} new connection`)
		socket.emit("connection", true)

		function newTask(fn, auth=false) {
			return (data, done) => {

				// Ensure user is authenticated, if required
				let user = this.sessions.get(socket.id)
				if (auth && !user) {
					done({ error: "User not authenticated" })
				} else {

					// Make client updater
					const session = {
						id: socket.id,
						user: user,
						toClient: msg => socket.emit(
							data.task,
							{ update: msg }
						)
					}
					session.toClient("Accepted")

					// Log activity
					console.log(`${pre} task: ${fn.name}(${JSON.stringify(data.args)})`)

					// Perform task
					fn(data.args, session)
						.then(result => {
							console.log(`${pre} result: ${fn.name} => ${JSON.stringify(result)}`)
							done({ result: result })
						})
						.catch(error => {
							console.log(`${pre} failed: ${fn.name} => ${error.message}`)
							done({ error: error })
						})

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
		socket.on("sign in", newTask(this.signInUser))
		socket.on("sign out", newTask(this.signOutUser))

		// Profile
		socket.on("load profile", newTask(this.getProfile))
		socket.on("update profile", newTask(this.updateProfile, true))

		// Follow users
		socket.on("follow", newTask(this.followUser, true))
		socket.on("unfollow", newTask(this.unfollowUser, true))
		socket.on("index followers", newTask(this.indexFollowers))
		socket.on("index following", newTask(this.indexFollowing))

		// Feed
		socket.on("feed", newTask(this.openFeed))
		socket.on("close feed", newTask(this.closeFeed))

		// Posts
		socket.on("create post", newTask(this.createPost, true))
		socket.on("index posts", newTask(this.indexPosts))
		socket.on("load post", newTask(this.getPost))
		socket.on("amend post", newTask(this.amendPost, true))
		socket.on("retract post", newTask(this.retractPost, true))
		socket.on("promote post", newTask(this.promotePost, true))

		// Topics
		socket.on("create topic", newTask(this.createTopic, true))
		socket.on("index topics", newTask(this.indexTopics))
		socket.on("load topic", newTask(this.getTopic))
		socket.on("update topic", newTask(this.updateTopic, true))
		socket.on("sell topic", newTask(this.sellTopic, true))
		socket.on("buy topic", newTask(this.buyTopic, true))

		// Pods
		socket.on("create pod", newTask(this.createPod, true))
		socket.on("index pods", newTask(this.indexPods))
		socket.on("load pod", newTask(this.getPod))
		socket.on("update pod", newTask(this.updatePod))
		socket.on("sell pod", newTask(this.sellPod))
		socket.on("buy pod", newTask(this.buyPod))

		// React
		socket.on("reaction", newTask(this.react, true))
		socket.on("load affinity", newTask(this.getAffinity, true))

		// Reporting
		socket.on("create report", newTask(this.createReport, true))
		socket.on("index reports", newTask(this.indexReports))
		socket.on("load report", newTask(this.getReport))
		socket.on("vote report", newTask(this.voteReport, true))

		// Sanctions
		socket.on("index sanctions", newTask(this.indexSanctions))
		socket.on("load sanction", newTask(this.getSancton))

		// Rights
		socket.on("index rights", newTask(this.indexRights))
		socket.on("load right", newTask(this.getRight))
		socket.on("update rights", newTask(this.updateRights, true))

		// Integrity
		socket.on("load integrity", newTask(this.getIntegrity))

		// Tokens
		socket.on("index transactions", newTask(this.indexTransactions))
		socket.on("load transaction", newTask(this.getTransaction))
		socket.on("create transaction", newTask(this.createTransaction, true))

		// Notification
		socket.on("index notifications", newTask(this.indexNotifications, true))
		socket.on("load notification", newTask(this.getNotification, true))

	}




// SEARCH

	search(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { target, among } = args
			session.toClient(`Searching for ${target}`)

			// Perform search
			this.db.search(target, among)
				.then(resolve)
				.catch(reject)

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
			let { identity, passphrase, name, bio, picture, ext } = args;
			
			// Store user on ledger
			session.toClient("Creating User")
			this.ledger
				.createUser(
					identity,
					passphrase,
					name,
					bio,
					picture,
					ext
				)
				.then(user => {

					// Store user in database
					session.toClient("Storing User")
					this.db.addUser(identity, user.address)

					//TODO - AWAIT FINALITY
					resolve({ address: user.address })

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

	signInUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { identity, passphrase } = args;
			session.toClient("Signing In")

			// Sign in
			this.ledger
				.user()
				.signIn(identity, passphrase)
				.then(user => {
					this.sessions.set(session.id, user)
					resolve({ address: user.address })
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
		return new Promise((resolve, reject) => {

			// Update profile
			session.user
				.setProfile(args)
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
				.then(resolve)
				.catch(reject)

		})
	}


	followUser(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack data
			let { address } = args
			session.toClient(`Unfollowing ${address}`)

			// Unfollow user
			session.user
				.unfollow(address)
				.then(resolve)
				.catch(reject)

		})
	}


	indexFollowers(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { address } = args
			session.toClient(`Fetching Followers of ${address}`)

			// Retreive followers
			session.user
				.followerIndex(address)
				.then(resolve)
				.catch(reject)

		})
	}


	indexFollowing(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			session.toClient(`Fetching Users Followed by ${session.user.address}`)

			// Retreive followers
			session.user
				.followingIndex()
				.then(resolve)
				.catch(reject)

		})
	}


// FEED

	openFeed(args, session) {
		return new Promise((resolve, reject) => {
			session.user
				.followingIndex()
				.then(index => index.map(address => {

					// Check if this user is already subscribed
					if (!this.feeds[address]) {
						this.feeds[address] = {
							subscribed: 1,
							user: this.ledger.user(address)
						}
					} else {
						this.feeds[address].subscribed++
					}

					// Subscribe this user
					this.feeds[address]
						.user
						.onPost(address => session.toClient(address))

					// Resolve
					resolve()

				}))
				.catch(reject)
		})
	}

	closeFeed(args, session) {
		return new Promise((resolve, reject) => {
			session.user
				.followingIndex()
				.then(index => index.map(address => {

					// Reduce subscribers
					this.feeds[address].subscribed--

					// Check if this user has no more subscribers
					if (this.feeds[address].subscribed <= 0) {
						delete this.feeds[address]
					}

					// Resolve
					resolve()

				}))
				.catch(reject)
		})
	}




// POSTS

	createPost(args, session) {
		return new Promise((resolve, reject) => {

			// Unpack request
			let { text, references, parent } = args
			session.toClient(`Creating Post: ${text}`)

			// Make post
			session.user
				.post(text, references, parent)
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

	getPost(args, session) {
		return new Promise((resolve, reject) => {
			
		})
	}

	amendPost(args, session) {
		return new Promise((resolve, reject) => {
			
		})
	}

	retractPost(args, session) {
		return new Promise((resolve, reject) => {
			
		})
	}

	promotePost(args, session) {
		return new Promise((resolve, reject) => {

		})
	}


}
