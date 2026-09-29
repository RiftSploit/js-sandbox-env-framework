import { parse, parseFragment } from 'parse5';
import * as cssSelect from 'css-select';

function simplify(node) {
    if (node.nodeName === '#text') return { type: 'text', value: node.value };
    if (node.nodeName === '#comment') return { type: 'comment', value: node.data };
    if (!node.tagName) return null;
    return {
        type: 'element',
        name: node.tagName,
        attributes: node.attrs.map(({ name, value }) => [name, value]),
        children: (node.content?.childNodes || node.childNodes || []).map(simplify).filter(Boolean)
    };
}

function descendants(node) {
    return node?.childNodes || [];
}

function walk(nodes, predicate, first = false) {
    const found = [];
    for (const node of nodes) {
        if (predicate(node)) {
            if (first) return node;
            found.push(node);
        }
        const children = walk(descendants(node), predicate, first);
        if (first && children) return children;
        if (!first) found.push(...children);
    }
    return first ? null : found;
}

const adapter = {
    isTag: node => node?.nodeType === 1,
    getChildren: descendants,
    getParent: node => node?.parentNode || null,
    getSiblings: node => node?.parentNode?.childNodes || [node],
    getName: node => node.localName || node.tagName?.toLowerCase() || '',
    getAttributeValue: (node, name) => node.getAttribute?.(name) ?? undefined,
    hasAttrib: (node, name) => node.hasAttribute?.(name) || false,
    getText: node => node.nodeType === 3 ? (node.data || '') : descendants(node).map(adapter.getText).join(''),
    findAll: (predicate, nodes) => walk(nodes, node => adapter.isTag(node) && predicate(node)),
    findOne: (predicate, nodes) => walk(nodes, node => adapter.isTag(node) && predicate(node), true),
    existsOne: (predicate, nodes) => !!adapter.findOne(predicate, nodes),
    removeSubsets(nodes) {
        return nodes.filter(node => !nodes.some(other => other !== node && other.contains?.(node)));
    }
};

export function createHtmlBridge() {
    return {
        parseDocument(html) {
            return parse(String(html)).childNodes.map(simplify).filter(Boolean);
        },
        parseFragment(html) {
            return parseFragment(String(html)).childNodes.map(simplify).filter(Boolean);
        },
        select(root, selector, includeRoot = false) {
            const roots = includeRoot ? [root] : descendants(root);
            return cssSelect.selectAll(String(selector), roots, { adapter, context: root, cacheResults: false });
        },
        matches(node, selector) {
            return cssSelect.is(node, String(selector), { adapter, cacheResults: false });
        }
    };
}
