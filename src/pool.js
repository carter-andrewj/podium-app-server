


// class Population {

// 	constructor() {
// 		this.cells = []
// 		this.cycle = 0
// 	}

// 	init() {
// 		//get config
// 		//schedule updates
// 	}

// 	update() {
// 		//refresh config
// 	}

// 	grow(users) {x
// 		let cell = new Cell(this)
// 		cell.users = users
// 		this.cells.push(cell)
// 	}

// 	add(user) {

// 		// Select next cell
// 		if (this.cycle >= this.cells.length) {
// 			this.cycle = 0
// 		} else {
// 			this.cycle++
// 		}

// 		// Add user
// 		this.cells[this.cycle].add(user)

// 	}

// }



// export default class Cell {

// 	constructor(population) {
// 		this.id = uuid()
// 		this.population = population
// 		this.users = []
// 	}


// 	add(user) {
// 		if (this.users.length >= this.population.config.size) {
// 			this.mitosis()
// 		}
// 		this.users.push(user)
// 	}


// 	mitosis() {

// 		// Split users
// 		const len = this.users.length
// 		const cut = Math.round(len / 2.0)
// 		let keep = this.users[0:cut-1]
// 		let kick = this.users[cut:len]

// 		// Keep the first half of users
// 		this.users = keep

// 		// Create a new population for the other half
// 		let child = this.population.grow(kick)

// 	}


// 	post() {

// 	}


// 	react() {

// 	}


// 	report() {

// 	}

	

// }