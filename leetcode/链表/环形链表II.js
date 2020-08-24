// 解题思路：
// 双指针，快指针每次迭代走2步，慢指针每次迭代走1步
// 从头节点到入环点的距离D
// 从入环点到首次相遇点的距离S1
// 从首次相遇点到入环点的距离S2

// 首次相遇时，慢指针走的距离，D+S1
// 首次相遇时，快指针走的距离，D+n(S1+S2)+S1，n是绕环的次数
// 因为块指针速度是慢指针的2倍
// 所以当首次相遇时，快指针走的距离还可以是：2(D+S1)
// 推出：D+n(S1+S2)+S1 = 2(D+S1) => 当n=1时 D=S2

function detectCycle(head) {
  let slow = head
  let fast = head
  while (fast && fast.next) {
    slow = slow.next
    fast = fast.next.next
    if (slow === fast) {
      fast = head
      while (true) {
        if (slow === fast) return fast
        slow = slow.next
        fast = fast.next
      }
    }
  }
  return null
}
