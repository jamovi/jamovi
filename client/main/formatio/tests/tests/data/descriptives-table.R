
results <- jmv::descriptives(ToothGrowth, vars=c('len', 'dose', 'supp'), mode=TRUE)
pb <- results$descriptives$asProtoBuf()
RProtoBuf::serialize(pb, 'descriptives-table.bin')
