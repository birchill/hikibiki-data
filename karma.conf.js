const path = require('path');

module.exports = (config) => {
  config.set({
    files: [{ pattern: 'src/**/*.test.ts', watched: false }],
    preprocessors: {
      '**/*.test.ts': ['webpack'],
    },
    frameworks: ['mocha', 'chai', 'webpack'],
    browsers: ['FirefoxHeadless', 'ChromeHeadless'],
    plugins: [
      require('karma-mocha'),
      require('karma-chai'),
      require('karma-webpack'),
      require('karma-firefox-launcher'),
      require('karma-chrome-launcher'),
    ],
    webpack: {
      mode: 'development',
      resolve: {
        extensions: ['.ts', '.js'],
      },
      resolveLoader: {
        modules: [path.join(__dirname, 'node_modules')],
      },
      module: {
        rules: [{ test: /\.ts$/, use: 'ts-loader' }],
      },
    },
  });
};
