import Podium from './podium';


// Ensure global variables are set
if (!process.env.AWS_ACCESS_KEY) {
	throw "AWS ACCESS KEY not found"
}
if (!process.env.AWS_SECRET_ACCESS_KEY) {
	throw "AWS SECRET KEY not found"
}


// Check for command-line arguments
const args = process.argv
var clean = args.includes("reset")


// Swallow event emitter warning
require('events').EventEmitter.prototype._maxListeners = 1000;


// Launch podium
new Podium()
	.launch(clean)
	.catch(error => {
		console.error(error)
		console.trace(error)
	})
