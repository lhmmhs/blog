// 思路：
// 奇数节点放1个链表，偶数节点放1个链表
// 关键点：
// 先改变节指向，后改变节点本身

function oddEvenList(head) {
  let odd = head
  let even = head.next
  let evenHead = even
  while (even && even.next) {
    odd.next = even.next
    odd = odd.next
    even.next = even.next.next
    even = even.next
  }
  odd.next = evenHead

  return head
}
