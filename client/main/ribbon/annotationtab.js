
'use strict';

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');
const Quill = require('quill');
const Icons = Quill.import('ui/icons');
const RibbonTab = require('./ribbontab');

class AnnotationTab extends RibbonTab {
    constructor() {
        super('annotation', 'E', _('Edit'));
    }

    getItem(name, _items) {
        if (_items === undefined)
            _items = this.getRibbonItems();

        for (let item of _items) {
            if (item.name && item.name === name)
                return item;
            else if (item.items) {
                let child = this.getItem(name, item.items);
                if (child)
                    return child;
            }
        }
    }

    clearValues(_items) {
        if (_items === undefined)
            _items = this.getRibbonItems();

        for (let item of _items) {
            if (item.value)
                item.setValue(null);
            else if (item.items)
                this.clearValues(item.items);
        }
    }

    createColorItems(prefix, resetText) {
        return [
            new RibbonButton({ title: resetText, name: prefix + 'Reset', class: 'reset-color' }),
            new RibbonSeparator(),
            new RibbonGroup({ orientation: 'horizontal', items: [
                new RibbonButton({ title: '#000000', name: prefix + '10', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#e60000', name: prefix + '11', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ff9900', name: prefix + '12', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ffff00', name: prefix + '13', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#008a00', name: prefix + '14', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#0066cc', name: prefix + '15', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#9933ff', name: prefix + '16', size: 'small', class: 'maintain-color color-sample' }),

            ]}),
            new RibbonGroup({ orientation: 'horizontal', items: [
                new RibbonButton({ title: '#ffffff', name: prefix + '20', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#facccc', name: prefix + '21', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ffebcc', name: prefix + '22', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ffffcc', name: prefix + '23', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#cce8cc', name: prefix + '24', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#cce0f5', name: prefix + '25', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ebd6ff', name: prefix + '26', size: 'small', class: 'maintain-color color-sample' })
            ]}),
            new RibbonGroup({ orientation: 'horizontal', items: [
                new RibbonButton({ title: '#bbbbbb', name: prefix + '30', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#f06666', name: prefix + '31', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ffc266', name: prefix + '32', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#ffff66', name: prefix + '33', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#66b966', name: prefix + '34', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#66a3e0', name: prefix + '35', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#c285ff', name: prefix + '36', size: 'small', class: 'maintain-color color-sample' })
            ]}),
            new RibbonGroup({ orientation: 'horizontal', items: [
                new RibbonButton({ title: '#888888', name: prefix + '40', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#a10000', name: prefix + '41', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#b26b00', name: prefix + '42', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#b2b200', name: prefix + '43', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#006100', name: prefix + '44', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#0047b2', name: prefix + '45', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#6b24b2', name: prefix + '46', size: 'small', class: 'maintain-color color-sample' })
            ]}),
            new RibbonGroup({ orientation: 'horizontal', items: [
                new RibbonButton({ title: '#444444', name: prefix + '50', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#5c0000', name: prefix + '51', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#663d00', name: prefix + '52', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#666600', name: prefix + '53', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#003700', name: prefix + '54', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#002966', name: prefix + '55', size: 'small', class: 'maintain-color color-sample' }),
                new RibbonButton({ title: '#3d1466', name: prefix + '56', size: 'small', class: 'maintain-color color-sample' })
            ]})
        ];
    }

    getRibbonItems(ribbon) {
        if (this.items === undefined) {
            this.items = [
                new RibbonGroup({
                    title: _('Clipboard'), margin: 'large', items: [
                        new RibbonButton({ title: _('Paste'), name: 'textPaste', size: 'large', shortcutKey: 'v', shortcutPosition: { x: '50%', y: '90%' } }),
                        new RibbonGroup({
                            orientation: 'vertical', items: [
                                new RibbonButton({ title: _('Cut'), name: 'textCut', size: 'small', shortcutKey: 'x', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Copy'), name: 'textCopy', size: 'small', shortcutKey: 'c1' })
                            ]
                        })
                    ]
                }),
                new RibbonSeparator(),
                new RibbonGroup({
                    title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                        new RibbonButton({ title: _('Undo Edit'), name: 'textUndo', size: 'small', shortcutKey: 'az' }),
                        new RibbonButton({ title: _('Redo Edit'), name: 'textRedo', size: 'small', shortcutKey: 'aq' })
                    ]
                }),
                new RibbonSeparator(),
                new RibbonGroup({
                    title: _('Font'), margin: 'large', orientation: 'vertical', items: [
                        new RibbonGroup({
                            orientation: 'horizontal', items: [
                                new RibbonButton({ title: _('Bold'), name: 'textBold', size: 'small', icon: Icons.bold, shortcutKey: '1', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Italic'), name: 'textItalic', size: 'small', icon: Icons.italic, shortcutKey: '2', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Underline'), name: 'textUnderline', size: 'small', icon: Icons.underline, shortcutKey: '3', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Strike'), name: 'textStrike', size: 'small', icon: Icons.strike, shortcutKey: '4', shortcutPosition: { x: '25%', y: '25%' } })
                            ]
                        }),
                        new RibbonGroup({
                            orientation: 'horizontal', items: [
                                new RibbonButton({ title: _('Sub Script'), name: 'textSubScript', size: 'small', icon: Icons.script.sub, shortcutKey: '5' }),
                                new RibbonButton({ title: _('Super Script'), name: 'textSuperScript', size: 'small', icon: Icons.script.super, shortcutKey: '6' }),
                                new RibbonSeparator(),
                                new RibbonButton({ title: _('Highlight Color'), name: 'textBackColor', size: 'small', class: 'color-picker', icon: Icons.background, subItems: this.createColorItems('bc', _('No Color')), shortcutKey: 'h' }),
                                new RibbonButton({ title: _('Text Color'), name: 'textColor', size: 'small', class: 'color-picker', icon: Icons.color, subItems: this.createColorItems('tc', _('Automatic')), shortcutKey: 'fc' })
                            ]
                        })
                    ]
                }),
                new RibbonSeparator(),
                new RibbonGroup({
                    title: _('Paragraph'), margin: 'large', orientation: 'vertical', items: [
                        new RibbonGroup({
                            orientation: 'horizontal', items: [
                                new RibbonButton({ title: _('Left Align'), name: 'textAlignLeft', size: 'small', icon: Icons.align[''], shortcutKey: 'al', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Center Align'), name: 'textAlignCenter', size: 'small', icon: Icons.align.center, shortcutKey: 'ac', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Right Align'), name: 'textAlignRight', size: 'small', icon: Icons.align.right, shortcutKey: 'ar', shortcutPosition: { x: '25%', y: '25%' } }),
                                new RibbonButton({ title: _('Justify'), name: 'textAlignJustify', size: 'small', icon: Icons.align.justify, shortcutKey: 'aj', shortcutPosition: { x: '25%', y: '25%' } })
                            ]
                        }),
                        new RibbonGroup({
                            orientation: 'horizontal', items: [
                                new RibbonButton({ title: _('Ordered List'), name: 'textListOrdered', size: 'small', icon: Icons.list.ordered, shortcutKey: 'n' }),
                                new RibbonButton({ title: _('Bullet List'), name: 'textListBullet', size: 'small', icon: Icons.list.bullet, shortcutKey: 'u' }),
                                new RibbonSeparator(),
                                new RibbonButton({ title: _('Indent -1'), name: 'textIndentLeft', size: 'small', icon: Icons.indent['-1'], shortcutKey: 'ao' }),
                                new RibbonButton({ title: _('Indent +1'), name: 'textIndentRight', size: 'small', icon: Icons.indent['+1'], shortcutKey: 'ai' })
                            ]
                        })
                    ]
                }),
                new RibbonSeparator(),
                new RibbonGroup({
                    title: _('Insert'), margin: 'large', items: [
                        new RibbonButton({ title: _('Formula'), name: 'textFormula', size: 'medium', icon: Icons.formula, shortcutKey: 'f' }),
                    ]
                }),
                new RibbonSeparator(),
                new RibbonGroup({
                    title: _('Styles'), margin: 'large', items: [
                        new RibbonButton({ title: _('Code-Block'), name: 'textCodeBlock', margin: 'large', size: 'large', icon: Icons['code-block'], shortcutKey: 'cb', shortcutPosition: { x: '50%', y: '90%' } }),
                        new RibbonButton({ title: _('Heading'), name: 'textH2', margin: 'large', size: 'large', icon: Icons.header['2'], shortcutKey: 'h', shortcutPosition: { x: '50%', y: '90%' } }),
                        //new RibbonButton({ title: _('Clear'), name: 'textClear', margin: 'large', size: 'large', icon: Icons.clean }),
                        new RibbonButton({ title: _('Link'), name: 'textLink', margin: 'large', size: 'large', icon: Icons.link, shortcutKey: 'l', shortcutPosition: { x: '50%', y: '90%' } })
                    ]
                })
            ];
        }
        return this.items;
    }
}

module.exports = AnnotationTab;
