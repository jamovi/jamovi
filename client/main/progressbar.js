
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var SilkyView = require('./view');

var ProgressBar = SilkyView.extend({
    className: "progress-bar",
    initialize: function() {
        this.model.on("change", this.updateProgress, this);
        this.render();
    },
    render: function() {

        this.$el.addClass("silky-progressbar");

        var html = '';

        html += '<div style="position: absolute ; top: 0 ; left: 0 ; width: 100% ; height: 100% ; display: table ; pointer-events:none;">';
        html += '   <div style="display: table-cell ; vertical-align: middle ; text-align: center ; pointer-events:none;">';
        html += '       <div class="silky-progressbar-content" style="display: inline-block; pointer-events: all;">';
        html += `           <div class="silky-progressbar-task">${_('Loading')}</div>`;
        html += '           <div class="silky-progressbar-bar-back">';
        html += '               <div class="silky-progressbar-bar-bar"></div>';
        html += '           </div>';
        html += '       </div>';
        html += '   </div>';
        html += '</div>';

        this.$el.html(html);

        this.$task = this.$el.find(".silky-progressbar-task");
        this.$bar  = this.$el.find(".silky-progressbar-bar-bar");

        this.updateProgress();
    },
    updateProgress: function() {

        var complete = this.model.get("complete");

        if (complete) {

            this.$el.hide();
        }
        else {

            this.$el.show();

            var task     = this.model.get("task");
            var progress = this.model.get("progress");

            this.$task.text(task);
            this.$bar.css("width", "" + parseInt(progress) + "%");
        }
    }
});

module.exports = ProgressBar;
