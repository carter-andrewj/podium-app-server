


export default class LedgerError extends Error {

	constructor(...args) {
		super(...args)
		this.podiumError = true	// To allow quick identification
								// of custom errors returned
								// from the server
	}

	withCode(code) {
		this.code = code;
		this.message = this.report(code);
		return this;
	}

	report() {
		switch (this.code) {

			// General errors
			case (1):
				return "No data received."
			case (2):
				return "Timed out."
			case (3):
				return "A user with that ID already exists."
			case (4):
				return "Cannot post an empty string."
			case (5):
				return "Cannot reply to nonexistent post."
			case (6):
				return "Insufficient funds."
			case (7):
				return "Cannot send < 0 funds."

			// Client-specific errors
			case (100): 
				return "Server Offline."
			case (101):
				return "Forbidden: Remote cannot write to ledger."
			case (102):
				return "Forbidden: Remote cannot create new network."

			// Server-specific errors
			case (200):
				return "Bad keypair with request."

			// Environment errors
			case (900):
				return "Environment Variable AWS_ACCESS_KEY not found."
			case (901):
				return "Environment Variable AWS_SECRET_ACCESS_KEY not found."

			// Default to unknown
			default:
				return "Unknown error."

		}
	}

}


