export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
	const node: HTMLElementTagNameMap[K] = document.createElement(tag);
	if (className !== undefined && className.length > 0) {
		node.className = className;
	}
	for (const ch of children) {
		if (typeof ch === "string") {
			node.appendChild(document.createTextNode(ch));
		} else {
			node.appendChild(ch);
		}
	}
	return node;
}
