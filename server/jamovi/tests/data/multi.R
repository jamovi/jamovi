
n <- 1000

df <- data.frame(
  int_col      = haven::labelled_spss(
                    as.integer(1:n),
                    na_values=c(-99, -100, -101),
                    label='An integer column with NA values'),
  
  int_col_2    = haven::labelled_spss(
                    rep(2:5, length.out=n),
                    labels = c(small=2, medium=3, large=4, xlarge=5),
                    na_range=c(-Inf, -99),
                    label='An integer column with NA <= -99'),
  
  dbl_col      = seq(0.1, by = 0.1, length.out = n),
  chr_col      = sprintf("item_%04d", 1:n),
  date_col     = as.Date("2020-01-01") + 0:(n - 1),
  datetime_col = as.POSIXct("2020-01-01 00:00:00", tz = "UTC") + 0:(n - 1),
  logical_col  = (1:n) %% 2 == 0,
  
  factor_col   = haven::labelled_spss(
                    rep(c("A", "B", "E", NA), length.out = n),
                    labels=c(Aardvark="A", Baboon="B", Cat="C", Dog="D")
                 )
)

df

haven::write_sav(df, 'multi.sav')
  