



export function awaitFinality(task, check, attempts = 0) {
	return new Promise((resolve, reject) => {
		setTimeout(
			() => {
				task()
					.then(check)
					.then(result => {
						if (result) {
							return
						} else if (attempts > 30) {
							reject("Timed out after 30 seconds.")
						} else {
							return awaitFinality(task, check, attempts++)
						}
					})
					.then(resolve)
					.catch(reject)
			},
			(attempts > 0) ? 1000 : 100
		)
	})
}