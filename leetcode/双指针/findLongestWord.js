/**
 * @param {string} s
 * @param {string[]} d
 * @return {string}
 */
var findLongestWord = function (s, d) {
  d.sort((a, b) => b.length - a.length)

  for (let i = 0; i < d.length; i++) {
    if (isSubSequence(d[i], s)) return d[i]
  }

  return ""
}

/**
 *
 * @param {string} d 指定字符串的子序列
 * @param {string} s 指定字符串
 */
function isSubSequence(d, s) {
  let i = 0
  // 子序列的索引
  let j = 0

  for (; i < s.length && j < d.length; i++) {
    if (s.charAt(i) === d.charAt(j)) {
      j++
    }
  }
  return j === d.length
}

let res = findLongestWord("abpcplea", ["ale", "apple", "monkey", "plea"])

console.log(res)
