function threeSumCloset(arr, target) {
  arr.sort((a, b) => a - b)
  let res = arr[0] + arr[1] + arr[arr.length - 1]
  for (let i = 0; i < arr.length - 2; i++) {
    const n1 = arr[i]
    let left = i + 1
    let right = arr.length - 1
    while (left < right) {
      let sum = n1 + arr[left] + arr[right]
      if (sum === target) {
        return sum
      } else if (sum > target) {
        // 和大于目标值，右指针向左移动
        right--
      } else {
        // 和小于目标值，左指针向右移动
        left++
      }

      if (Math.abs(sum - target) < Math.abs(res - target)) {
        res = sum
      }
    }
  }

  return res
}

let res = threeSumCloset([-1, 2, 1, -4, -2, 3], 5)

console.log(res)
