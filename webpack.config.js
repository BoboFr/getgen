const path = require('path');
const JavaScriptObfuscator = require('webpack-obfuscator');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  target: 'node',
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  targets: {
                    node: '12'
                  }
                }],
                '@babel/preset-typescript'
              ]
            }
          },
          'ts-loader'
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'commonjs2',
    },
  },
  plugins: [
    new JavaScriptObfuscator({
      rotateStringArray: true,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      renameGlobals: false,
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      numbersToExpressions: true,
      simplify: true,
      shuffleStringArray: true,
      splitStrings: true,
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    })
  ],
};
