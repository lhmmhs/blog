// 解题思路：迭代
// 三个指针 prev cur temp
// 每次迭代，将当前节点指向前驱节点

function reverseList(head) {
  let cur = head
  let prev = null
  let temp = null
  while (cur) {
    temp = cur.next
    cur.next = prev
    prev = cur
    cur = temp
  }
  return dummy.next
}
