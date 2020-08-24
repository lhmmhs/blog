// 解题思路：双指针
// 第1个指针移动n+1步后
// 第2个指针从头开始移动，此时2个指针相差n个节点
// 同时移动2个指针，循环结束时，第2个指针所指向的节点是要删除节点的前驱节点
// 使用该指针的next指向该指针下下个节点

function removeNthFromEnd(head, n) {
  let dummy = new ListNode()
  dummy.next = head
  let first = dummy
  let second = dummy
  let i = 0
  for (; i < n + 1; i++) {
    first = first.next
  }
  while (first) {
    first = first.next
    second = second.next
  }

  return dummy.next
}
