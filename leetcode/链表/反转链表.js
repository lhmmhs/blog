// 解题思路：迭代
// 三个指针 prev cur temp
// 关键点：
// 每次迭代，将当前节点指向前驱节点
// 前驱点是上一次循环所确定的节点
// 第一次循环，前驱节点是null
// 当前节点(链表的头部节点)指向null，前驱节点变更为当前节点（头节点）
// 第二次循环，前驱节点是头节点
// 当前节点(链表第二个节点)指向头节点
// 依次循环，直到循环结束

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
  return prev
}
