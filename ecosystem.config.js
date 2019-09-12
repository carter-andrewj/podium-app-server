module.exports = {
  apps: [{
    name: 'podium-app-server',
    script: './src/index.js'
  }],
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'ec2-184-72-129-237.compute-1.amazonaws.com',
      key: '~/.ssh/development.pem',
      ref: 'origin/master',
      repo: 'https://github.com/carter-andrewj/podium-app-server.git',
      path: '/home/ubuntu/podium-app-server',
      'post-deploy': 'npm install && pm2 startOrRestart ecosystem.config.js'
    }
  }
}
