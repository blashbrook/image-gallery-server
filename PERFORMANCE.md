# Gallery Server - Performance Optimizations

## Thumbnail Generation Performance

The gallery server automatically optimizes thumbnail generation based on the size of your gallery.

### Adaptive Batch Processing

| Gallery Size | Batch Size | Speed Improvement | Broadcast Frequency |
|--------------|------------|-------------------|---------------------|
| **< 100 files** | 3 concurrent | Baseline | Every image |
| **100-500 files** | 6 concurrent | ~2x faster | Every 10 images |
| **500+ files** | 10 concurrent | ~3.3x faster | Every 50 images |

### Optimizations for Large Galleries (500+ files)

When processing 500+ images, the server automatically:

1. **Increases Concurrency**: Processes 10 thumbnails at once instead of 3
2. **Reduces Broadcast Overhead**: Only sends progress updates every ~50 images instead of every image
3. **Minimizes Delays**: Uses 50ms between batches instead of 100ms
4. **Skips Tiny Previews**: Generates only the final thumbnail, skipping the 64x64 preview step
5. **Batch Logging**: Only logs every 10th batch to reduce console overhead

### Performance Comparison

For a gallery with **1000 images**:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Concurrent Processing** | 3 | 10 | 3.3x |
| **SSE Broadcasts** | 1000 | 20 | 50x fewer |
| **Batch Delays** | 333 × 200ms = 66s | 100 × 50ms = 5s | 13x faster |
| **Tiny Previews** | 1000 | 0 | Eliminated |
| **Console Logs** | ~330 lines | ~30 lines | 11x fewer |

**Expected time reduction**: ~60-70% faster for 1000+ image galleries

### Configuration

You can adjust performance settings in `bin/server-runner.js`:

```javascript
const THUMBNAIL_CONFIG = {
    batchSize: {
        large: 10,    // For 500+ images
        medium: 6,    // For 100-500 images
        small: 3      // For <100 images
    },
    broadcastRatio: 50,  // Broadcast every N images
    batchDelay: {
        large: 50,    // Delay for large galleries (ms)
        small: 100    // Delay for small galleries (ms)
    },
    quality: {
        jpeg: 80,     // JPEG quality (1-100)
        size: 300     // Max thumbnail dimension (px)
    }
};
```

### Trade-offs

**Increased batch size**:
- ✅ Faster overall processing
- ✅ Better CPU/memory utilization
- ⚠️ Slightly higher memory usage (temporary)

**Reduced broadcasts**:
- ✅ Less network/SSE overhead
- ✅ Better browser performance
- ⚠️ Progress bar updates less frequently (still smooth)

**No tiny previews**:
- ✅ Half the image processing work
- ✅ Less disk I/O
- ⚠️ Thumbnails appear all at once instead of progressively

### System Requirements

For optimal performance with large galleries:
- **CPU**: Multi-core processor (4+ cores recommended)
- **RAM**: 4GB+ available (Sharp library uses memory for processing)
- **Disk**: SSD recommended for faster thumbnail read/write

### Monitoring

Watch the console output for performance metrics:

```
🔄 Processing 1000 thumbnails in batches of 10...
⚡ Optimized mode: Broadcasting every 50 images
🖼️  Processing batch 1/100
🖼️  Processing batch 11/100
✅ Background thumbnail generation completed
📊 Final stats: 998 success, 2 errors, 1000/1000 processed
```

### Tips for Very Large Galleries (5000+ files)

For extremely large galleries, consider:

1. **Pre-generate thumbnails**: Run `gallery up` once and let it complete before sharing
2. **Keep server running**: File watching ensures new images get thumbnails automatically
3. **Use SSD storage**: Significantly faster than HDD for thumbnail generation
4. **Increase batch size**: Edit `THUMBNAIL_CONFIG.batchSize.large` to 15-20 if you have 8+ CPU cores

### Troubleshooting

**"Server seems slow on first load"**:
- This is normal for large galleries - thumbnails are generated on first scan
- Subsequent loads are instant (thumbnails are cached)

**"Progress bar stuck"**:
- For 500+ images, progress updates every ~50 images
- Check console logs to verify processing continues

**"Out of memory errors"**:
- Reduce `batchSize.large` to 6-8
- Consider processing in smaller directory chunks

**"Thumbnails are blurry"**:
- Increase `quality.jpeg` to 90-95
- Increase `quality.size` to 400-500

---

## Cache Performance

Thumbnail caching ensures fast subsequent loads:

- **First scan**: ~1-2 seconds per image (thumbnail generation)
- **Cached loads**: ~0.001 seconds per image (instant)
- **Cache location**: `.gallery-cache/thumbnails/` in each scanned directory
- **Cache invalidation**: Automatic via file watching

The cache persists across server restarts, so you only generate thumbnails once.
