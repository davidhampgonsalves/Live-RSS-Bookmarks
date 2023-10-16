const webpack = require('webpack');
const path = require('path');

var options = {
  mode: 'development',
  devtool: 'source-map',
  entry: {
    background: path.join(__dirname, 'src', 'background.js'),
    options: path.join(__dirname, 'src', 'options.js'),
  },
  output: {
    path: path.join(__dirname, 'build'),
    filename: '[name].js',
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  resolve: {
    fallback: {
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      timers: require.resolve('timers-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
    },
  },
};

module.exports = options;
