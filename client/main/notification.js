
'use strict';

const _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var SilkyView = require('./view');

var Notification = SilkyView.extend({
    className: "notification",
    events : {
        'click .silky-notification-link'    : '_linkClicked'
    },
    initialize: function() {
        this.model.on("change", this.render, this);
        this.model.on("change:index", this.movedown, this);
        this.bottom = (10*(this.model.attributes.index+1)+50*this.model.attributes.index);
        this.render();
    },
    render: function() {

        this.$el.addClass("silky-notification");
        
        if (this.model.attributes.visible){
            this.$el.css("visibility", "visible");        
        }else{
            this.$el.css("visibility", "hidden");
        }
        
        this.secondtimer = null;
        if (this.model.attributes.timeToFade > 0){
            setTimeout(() => {
                this.$el.find(".silky-notification-link").addClass("silky-notification-link-fadeout");
                this.secondtimer = setTimeout(() => {
                    this.model.set("visible" , false);
                    this.model.set("timeToFade" , 0);
                    this.model.parent.remove(this);
                }, 2000);
            }, this.model.attributes.timeToFade);
        }
        
        var html = '';
        
        html += '<div class="silky-notification-box">';
        html += '    <span class="silky-notification-content">';
        html += '       <h1>';
        html += this.model.title;
        html += '       </h1>';
        html +=  (this.model.attributes.content === null) ? '':this.model.attributes.content +'</br>';
        html +=  (this.model.attributes.description === null) ? '':this.model.attributes.description +'</br>';
        html +=  (this.model.attributes.errorMessage === null) ? '':this.model.attributes.errorMessage +'</br>';
        html +=  (this.model.attributes.errorCause === null) ? '':this.model.attributes.errorCause;
        html += '    </span>';
        if (this.model.attributes.linkText !== ''){
            html += '    <span class="silky-notification-link">';
            html += this.model.attributes.linkText;
            html += '    </span>';
        }
        html += '</div>';

        this.$el.html(html);
        
        
        
        
        var newbottom = (10*(this.model.attributes.index+1)+50*this.model.attributes.index);
        var diff = Math.abs(this.bottom-newbottom);
        var $box = this.$el.find(".silky-notification-box");
        
        if (this.bottom === newbottom){
            $box.css("bottom", ""+newbottom+"px");
        }else if (this.bottom > newbottom){
            $box.css("bottom", ""+this.bottom+"px");
            $box.animate({bottom: "-="+diff}, "slow");
            this.bottom = newbottom;
        }else if (this.bottom < newbottom){
            $box.css("bottom", ""+this.bottom+"px");
            $box.animate({bottom: "+="+diff}, "slow");
            this.bottom = newbottom;
        }
    },
    _linkClicked : function(event){
        this.model.linkAction();
        if (this.model.attributes.hideOnAction){
            this.model.set("visible" , false);
            this.$el.css("visibility", "hidden");
            this.render();
            this.model.parent.remove(this);
        }
    }
});

module.exports = Notification;
