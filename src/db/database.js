import loki from 'lokijs';



export default class Database {


	constructor(config, network) {
		this.db = undefined;
		this.config = config;
		this.network = network;
	}


	// Initialise the database
	build() {
		return new Promise((resolve, reject) => {
			this.db = new loki(
				`${this.network.get("ID")}.db`,
				{
					autosave: this.config.get("AutoSave"), 
					autosaveInterval: this.config.get("BackupFrequency"),
					autoload: this.config.get("AutoLoad"), 
					autoloadCallback: () => {

						// Confirm or create record stores
						this.initUsers()
						// this.initSessions()
						this.initAlerts()
						//TODO - Initialize topics, etc...

						//TODO - Add dynamic views for quick searching, curating, etc...

						// Make sure the db save object is created
						this.db.saveDatabase(() => resolve(this))

					}
				}
			)
		})
	}




// SESSION MANAGEMENT

	// initSessions() {
	// 	this.sessions = 
	// 		this.db.getCollection("sessions") ||
	// 		this.db.addCollection("sessions", {
	// 			unique: ["id"]
	// 		})
	// }

	// addSession(id, user) {
	// 	this.sessions
	// 		.insert({
	// 			id: id,
	// 			user: user
	// 		})
	// }

	// endSession(id) {
	// 	this.sessions
	// 		.delete({
	// 			id: id
	// 		})
	// }

	// getSession(id) {
	// 	const session = this.sessions.findOne({ id: id })
	// 	return session ? session.user : false
	// }





// SEARCH

	search(target, among=["users"]) {
		const records = this.users
			.find({ search: { "$regex": target.toLowerCase() }})
		return fromJS(records)
			.map(rec => Map({
				address: rec.get("address"),
				id: rec.get("id"),
				searchid: rec.get("searchid")
			}))
			.toList()
	}




// USERS

	initUsers() {
		this.users =
			this.db.getCollection("users") ||
			this.db.addCollection("users", {
				unique: ["id", "address"]
			})
	}

	addUser(id, address) {
		this.users
			.insert({
				id: id.toLowerCase(),
				address: address,
				search: id.toLowerCase()
			})
	}

	getUser(target, by="id") {
		let finder;
		switch (by) {
			case "address":
				finder = { address: target }
				break;
			default:
				finder = { search: target.toLowerCase() }
		}
		const check = this.users.findOne(finder)
		return check ? check.address : false
	}



// ALERTS

	initAlerts() {
		this.alerts =
			this.db.getCollection("alerts") ||
			this.db.addCollection("alerts", {
				unique: ["key"],
				ttl: 7 * 24 * 60 * 60 * 1000,		// Alerts are kept for 1 week
				ttlInterval: 24 * 60 * 60 * 1000	// And cleared out daily
			})
	}

	getAlerts() {

	}

	clearAlerts() {

	}


}



