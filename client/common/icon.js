'use strict';
class jamoviIcon {
    constructor(version) {
        this.el = this.parseHTML(`<div class="icon-info-box">
            <div class="icon-version">
                <svg width="75px" height="67.5px" viewBox="0 0 48.568981 47.277932" version="1.1">
                    <g transform="translate(-3.1769712,-1.2930852)">
                        <path style="fill:#e3e3e3;fill-opacity:1;stroke:none;stroke-width:0;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" d="m 8.1769712,24.932055 0,-18.6389698 4.9139108,0 4.9139,0 0,12.9006798 0,12.90065 0.76252,-0.23647 c 3.00696,-0.93257 7.59364,-4.08677 10.4866,-7.21152 4.36735,-4.71726 6.62991,-9.73005 7.5574,-16.7436098 l 0.21288,-1.60973 4.86088,0 4.86089,0 -0.14893,1.44028 c -0.8641,8.3553198 -2.84932,13.8160698 -7.28434,20.0367298 -4.32197,6.06215 -10.62508,10.80121 -18.1162,13.62085 -2.85777,1.07567 -8.407311,2.18007 -10.954671,2.18007 l -2.0648398,0 z" sodipodi:nodetypes="cccccccssccccssscc"></path>
                    </g>
                </svg>
                <div class="version-separator"></div>
                <div class="version-text">version <span id="version">${this.cleanVersion(version)}</span></div>
            </div>
        </div>`)[0];
    }

    cleanVersion(version) {
        var i = -1;
        let n = 3;

        while (n-- && i++ < version.length) {
            i = version.indexOf('.', i);
            if (i < 0) break;
        }

        if (i !== -1) 
            return version.substring(0, i);
        
        return version;
    }
    
    parseHTML(str) {
        const tmp = document.implementation.createHTMLDocument('');
        tmp.body.innerHTML = str;
        return [...tmp.body.childNodes];
    }
}

module.exports = jamoviIcon;