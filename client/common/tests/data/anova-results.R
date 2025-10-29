results <- jmv::ANOVA(formula=len~dose*supp, data=ToothGrowth, emMeans=~dose:supp, postHoc=~dose+supp+supp:dose)
pb <- results$asProtoBuf()
RProtoBuf::serialize(pb, 'anova-results.bin')
