// 思路：
// 1个哨兵节点，2个指针
// 1个指针是前驱节点，1个指针是当前节点
// 迭代遇到要删除的节点时，前驱节点指向当前节点的后继节点
// 关键点：如果当前循环删除节点，则不需要前进前驱节点

var removeElements = function (head, val) {
  let dummy = new ListNode()
  dummy.next = head
  let pre = dummy
  let cur = dummy.next
  while (cur) {
    if (cur.val === val) {
      pre.next = cur.next
    } else {
      // 如果是要删除的节点，前驱节点不需要移动
      pre = pre.next
    }
    cur = cur.next
  }
  return dummy.next
}
