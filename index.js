var merge = require('lodash.merge')

var getAssetKind = require('./lib/getAssetKind')
var isHMRUpdate = require('./lib/isHMRUpdate')
var isSourceMap = require('./lib/isSourceMap')

var createQueuedWriter = require('./lib/output/createQueuedWriter')
var createOutputWriter = require('./lib/output/createOutputWriter')

function AssetsWebpackPlugin (options) {
  this.options = merge({}, {
    path: '.',
    filename: 'webpack-assets.json',
    prettyPrint: false,
    update: false,
    fullPath: true,
    getName: (path) => path
  }, options)
  this.writer = createQueuedWriter(createOutputWriter(this.options))
}

AssetsWebpackPlugin.prototype = {

  constructor: AssetsWebpackPlugin,

  apply: function (compiler) {
    var self = this

    compiler.plugin('after-emit', function (compilation, callback) {
      var options = compiler.options
      var stats = compilation.getStats().toJson({
        hash: true,
        publicPath: true,
        assets: true,
        chunks: false,
        modules: false,
        source: false,
        errorDetails: false,
        timings: false
      })
            // publicPath with resolved [hash] placeholder

      var assetPath = (stats.publicPath && self.options.fullPath) ? stats.publicPath : ''
            // assetsByChunkName contains a hash with the bundle names and the produced files
            // e.g. { one: 'one-bundle.js', two: 'two-bundle.js' }
            // in some cases (when using a plugin or source maps) it might contain an array of produced files
            // e.g. {
            // main:
            //   [ 'index-bundle-42b6e1ec4fa8c5f0303e.js',
            //     'index-bundle-42b6e1ec4fa8c5f0303e.js.map' ]
            // }
      var assetsByChunkName = stats.assetsByChunkName
      var seenAssets = {}

      var chunks = Object.keys(assetsByChunkName)
      chunks.push('')  // push "empty" chunk
      var output = chunks.reduce(function (chunkMap, chunkName) {
        var assets = chunkName ? assetsByChunkName[chunkName] : stats.assets
        if (!Array.isArray(assets)) {
          assets = [assets]
        }
        var added = false
        var typeMap = assets.reduce(function (typeMap, obj) {
          var asset = obj.name || obj
          if (isHMRUpdate(options, asset) || isSourceMap(options, asset) || !chunkName && seenAssets[asset]) {
            return typeMap
          }

          var name = self.options.getName(asset)
          typeMap[name] = assetPath + asset

          added = true
          seenAssets[asset] = true;
          return typeMap
        }, {})

        if (added) {
          merge(chunkMap, typeMap)
        }
        return chunkMap
      }, {})

      var manifestName = self.options.includeManifest === true ? 'manifest' : self.options.includeManifest
      if (manifestName) {
        var manifestEntry = output[manifestName]
        if (manifestEntry) {
          var manifestAssetKey = manifestEntry.js.substr(assetPath.length)
          var parentSource = compilation.assets[manifestAssetKey]
          var entryText = parentSource.source()
          if (!entryText) {
            throw new Error('Could not locate manifest function in source', parentSource)
          }
          // use _value if the uglify plugin was applied
          manifestEntry.text = entryText
        }
      }

      if (self.options.metadata) {
        output.metadata = self.options.metadata
      }

      self.writer(output, function (err) {
        if (err) {
          compilation.errors.push(err)
        }
        callback()
      })
    })
  }
}

module.exports = AssetsWebpackPlugin
