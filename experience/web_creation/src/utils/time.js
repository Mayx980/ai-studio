import dayjs from 'dayjs'

export const formatTime = (timestamp, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
    return '-'
  }

  const str = String(timestamp)
  if (str.length !== 10 && str.length !== 13) {
    return '-'
  }

  return dayjs(str.length === 10 ? timestamp * 1000 : timestamp).format(format)
}
