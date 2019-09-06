const fs = require("fs");

const configFile = "./data/config.json";

let config = JSON.parse(fs.readFileSync(configFile));

config.App.Version++;

fs.writeFileSync(configFile, JSON.stringify(config, null, 4));

console.log(
	"Incremented Network Version " +
	`${config.App.Version - 1} >> ${config.App.Version}`
)