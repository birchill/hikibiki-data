const path = require('path');

module.exports = config => {
  config.set({
    files: [{ pattern: 'src/**/*.ts', watched: false }],
    preprocessors: {
      '**/*.ts': ['karma-typescript'],
    },
    frameworks: ['mocha', 'chai', 'karma-typescript'],
    reporters: ['progress', 'karma-typescript'],
    browsers: ['Firefox', 'Chrome'],
    plugins: [
      require('karma-mocha'),
      require('karma-chai'),
      require('karma-firefox-launcher'),
      require('karma-chrome-launcher'),
      require('karma-typescript'),
    ],
    karmaTypescriptConfig: {
      compilerOptions: {
        module: 'commonjs',
        target: 'es6'
      },
      tsconfig: './tsconfig.json',
    },
  });
};
