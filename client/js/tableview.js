var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $
var SilkyView = require('./view')

var TableView = SilkyView.extend({
    className: "tableview",
    initialize: function() {
        _.bindAll(this, '_dataSetLoaded', 'scrollHandler', 'updateViewRange', 'resizeHandler', 'refreshCells')

        $(window).resize(this.resizeHandler)

        this.$el.on('resized', this.resizeHandler);

        this.model.on('dataSetLoaded', this._dataSetLoaded, this)
        this.model.on('change:cells',  this._updateCells, this)

        this.viewIndices = null
        this.viewOuterRange = { top: 0, bottom: -1, left: 0, right: -1 }

        this.$el.addClass("silky-tableview")

        var html = ''
        html += '<div class="silky-table-header">'
        html += '    <div class="silky-column-header">&nbsp;</div>'   // padding so we can inspect the height of the table header
        html += '</div>'
        html += '<div class="silky-table-container">'
        html += '    <div class="silky-table-body"></div>'
        html += '</div>'

        this.$el.html(html)
        this.$container = this.$el.find('.silky-table-container')
        this.$header    = this.$el.find('.silky-table-header')
        this.$body      = this.$container.find('.silky-table-body')
        this.$columns   = [ ]

        this.$container.on("scroll", this.scrollHandler)

        var self = this

        Promise.resolve().then(function() {

            return new Promise(function(resolve, reject) {
                setTimeout(resolve, 0)
            })

        }).then(function() {

            self._rowHeight = self.$header.height()  // read and store the row height
            self.$header.empty()  // clear the temporary cell
            self.$container.css('top', self._rowHeight)
            self.$container.css('height', self.$el.height() - self._rowHeight)
        })
    },
    _dataSetLoaded : function() {

        var columns = this.model.get('columns')
        var left = 0

        this._lefts = Array(columns.length)  // store the left co-ordinate for each column

        for (var colNo = 0; colNo < columns.length; colNo++) {
            var column = columns[colNo]
            var width  = column.width

            html = ''
            html += '<div class="silky-column-header ' + column.measureType + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ;">'
            html +=     column.name
            html += '</div>'

            this.$header.append(html)
            this.$body.append('<div class="silky-column" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>')

            this._lefts[colNo] = left
            left += width
        }

        this.$columns = this.$body.children()
        this.$body.css('width',  left)

        var rowCount = this.model.get('rowCount')
        var totalHeight = rowCount * this._rowHeight
        this.$body.css('height', totalHeight)

        this.updateViewRange()

    },
    _updateCells : function() {

        var colOffset = this.model.get('viewport').left
        var cells = this.model.get('cells')

        for (var colNo = 0; colNo < cells.length; colNo++) {

            var column = cells[colNo]
            var $column = $(this.$columns[colOffset + colNo])
            var $cells  = $column.children()

            for (var rowNo = 0; rowNo < column.length; rowNo++) {
                var  cell = column[rowNo]
                var $cell = $($cells[rowNo])

                if (cell === -2147483648 || (typeof(cell) === 'number' && isNaN(cell)))
                    cell = ''

                $cell.text(cell)
            }
        }

    },
    scrollHandler : function(evt) {

        if (this.model.get('hasDataSet') === false)
            return

        var currentViewRange = this.getViewRange()
        if (this.encloses(this.viewOuterRange, currentViewRange) == false)
            this.updateViewRange()

        var left = this.$container.scrollLeft()
        this.$header.css('left', -left)
        this.$header.css('width', this.$el.width() + left)
    },
    resizeHandler : function(evt) {

        if (this.model.get('hasDataSet') === false)
            return

        var currentViewRange = this.getViewRange()
        if (this.encloses(this.viewOuterRange, currentViewRange) == false)
            this.updateViewRange()

        var left = this.$container.scrollLeft()
        this.$header.css('left', -left)
        this.$header.css('width', this.$el.width() + left)
        this.$container.css('height', this.$el.height() - this._rowHeight)
    },
    updateViewRange : function() {

        var v = this.getViewRange()

        var topRow = Math.floor(v.top / this._rowHeight) - 1
        var botRow = Math.ceil(v.bottom / this._rowHeight) - 1

        var rowCount = this.model.get('rowCount')
        var columnCount = this.model.get('columnCount')

        if (botRow > rowCount - 1)
            botRow = rowCount - 1
        if (botRow < 0)
            botRow = 0
        if (topRow > rowCount - 1)
            topRow = rowCount - 1
        if (topRow < 0)
            topRow = 0

        var columns = this.model.get("columns")

        var leftColumn  = _.sortedIndex(this._lefts, v.left) - 1
        var rightColumn = _.sortedIndex(this._lefts, v.right) - 1

        if (leftColumn > columnCount - 1)
            leftColumn = columnCount - 1
        if (leftColumn < 0)
            leftColumn = 0
        if (rightColumn > columnCount - 1)
            rightColumn = columnCount - 1
        if (rightColumn < 0)
            rightColumn = 0

        var oTop  = (topRow * this._rowHeight)
        var oBot  = (botRow * this._rowHeight)
        var oLeft = this._lefts[leftColumn]

        var oRight
        if (rightColumn == columns.length - 1) // last column
            oRight = Infinity
        else
            oRight = this._lefts[rightColumn] + columns[rightColumn].width

        var oldViewIndices = this.viewIndices

        this.viewRange      = v
        this.viewOuterRange = { top : oTop,   bottom : oBot,   left : oLeft,      right : oRight }
        this.viewIndices    = { top : topRow, bottom : botRow, left : leftColumn, right : rightColumn }

        //console.log("view")
        //console.log(this.viewIndices)
        //console.log(this.viewRange)
        //console.log(this.viewOuterRange)

        this.refreshCells(oldViewIndices, this.viewIndices)
    },
    _createCellHTML : function(top, height, content) {
        return '<div class="silky-column-cell" style="top : ' + top + 'px ; height : ' + height + 'px">' + content + '</div>'
    },
    refreshCells : function(oldViewIndices, newViewIndices) {

        var o = oldViewIndices
        var n = newViewIndices

        var columns = this.model.get('columns')

        if (o === null || this.overlaps(o, n) === false) { // entirely new cells

            if (o !== null) {  // clear old cells

                for (var i = o.left; i <= o.right; i++) {
                    var $column = $(this.$columns[i])
                    $column.empty()
                }
            }

            var nRows = n.bottom - n.top + 1

            for (var i = n.left; i <= n.right; i++) {

                var column  = columns[i]
                var $column = $(this.$columns[i])

                for (var j = 0; j < nRows; j++) {
                    var rowNo = n.top + j
                    var top   = rowNo * this._rowHeight
                    var $cell = $(this._createCellHTML(top, this._rowHeight, ''))
                    $column.append($cell)
                }
            }
        }
        else {  // add or subtract from cells displayed


            if (n.right > o.right) {

                var nCols = n.right - o.right
                var rowCount = n.bottom - n.top + 1

                for (var i = 0; i < nCols; i++) {

                    var colNo = o.right + i + 1
                    var left  = this._lefts[colNo]
                    var column = columns[colNo]
                    var $column = $(this.$columns[colNo])

                    for (var j = 0; j < rowCount; j++) {
                        var rowNo = n.top + j
                        var top = this._rowHeight * rowNo
                        var $cell = $(this._createCellHTML(top, this._rowHeight, ''))
                        $column.append($cell)
                    }
                }
            }
            else if (n.right < o.right) {
                var nCols = o.right - n.right
                var count = this.$columns.length
                for (var i = 0; i < nCols; i++) {
                    var $column = $(this.$columns[o.right - i])
                    $column.empty()
                }
            }

            if (n.left < o.left) {

                var nCols = o.left - n.left
                var rowCount = n.bottom - n.top + 1

                if (o.left - n.left == 2)
                    rowCount = rowCount

                for (var i = 0; i < nCols; i++) {

                    var colNo = n.left + i
                    var left  = this._lefts[colNo]
                    var column = columns[colNo]
                    var $column = $(this.$columns[colNo])

                    for (var j = 0; j < rowCount; j++) {
                        var rowNo = n.top + j
                        var top = this._rowHeight * rowNo
                        var $cell = $(this._createCellHTML(top, this._rowHeight, ''))
                        $column.append($cell)
                    }
                }
            }
            else if (n.left > o.left) {
                var nCols = n.left - o.left
                var count = this.$columns.length
                for (var i = 0; i < nCols; i++) {
                    var $column = $(this.$columns[o.left + i])
                    $column.empty()
                }
            }

            if (n.bottom > o.bottom) {

                var nRows = n.bottom - o.bottom  // to add to the bottom

                var left  = Math.max(o.left,  n.left)
                var right = Math.min(o.right, n.right)

                for (var i = left; i <= right; i++) {

                    var column  = columns[i]
                    var $column = $(this.$columns[i])

                    for (var j = 0; j < nRows; j++) {
                        var rowNo = o.bottom + j + 1
                        var top   = rowNo * this._rowHeight
                        var $cell = $(this._createCellHTML(top, this._rowHeight, ''))
                        $column.append($cell)
                    }
                }
            }

            if (n.bottom < o.bottom) {

                var nRows = o.bottom - n.bottom  // to remove from the bottom

                var left  = Math.max(o.left,  n.left)
                var right = Math.min(o.right, n.right)

                for (var i = left; i <= right; i++) {

                    var $column = $(this.$columns[i])
                    var $cells = $column.children()
                    var count = $cells.length

                    for (var j = 0; j < nRows; j++)
                        $($cells[count - j - 1]).remove()
                }
            }

            if (n.top < o.top) {

                var nRows = o.top - n.top  // add to top

                var left  = Math.max(o.left,  n.left)
                var right = Math.min(o.right, n.right)

                for (var i = left; i <= right; i++) {

                    var column  = columns[i]
                    var $column = $(this.$columns[i])

                    for (var j = 0; j < nRows; j++) {
                        var rowNo = o.top - j - 1
                        var top   = rowNo * this._rowHeight
                        var $cell = $(this._createCellHTML(top, this._rowHeight, ''))
                        $column.prepend($cell)
                    }
                }
            }

            if (n.top > o.top) {

                var nRows = n.top - o.top

                var left  = Math.max(o.left,  n.left)
                var right = Math.min(o.right, n.right)

                for (var c = left; c <= right; c++) {
                    var $column = $(this.$columns[c])
                    var $cells = $column.children()
                    for (var r = 0; r < nRows; r++)
                        $($cells[r]).remove()
                }
            }
        }

        this.model.set('viewport', n)

    },
    getViewRange : function() {
        var vTop   = this.$container.scrollTop()
        var vBot   = vTop + this.$el.height()
        var vLeft  = this.$container.scrollLeft()
        var vRight = vLeft + this.$el.width()

        return { top : vTop, bottom : vBot, left : vLeft, right : vRight }
    },
    encloses : function(outer, inner) {
        return outer.left   <= inner.left
            && outer.right  >= inner.right
            && outer.top    <= inner.top
            && outer.bottom >= inner.bottom
    },
    overlaps : function(one, two) {
        var colOverlap = (one.left >= two.left && one.left <= two.right) || (one.right >= two.left && one.right <= two.right)
        var rowOverlap = (one.top <= two.bottom && one.top >= two.top)  || (one.bottom <= two.bottom && one.bottom >= two.top)
        return rowOverlap && colOverlap
    }
})

module.exports = TableView
