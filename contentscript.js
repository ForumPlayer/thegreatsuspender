/*
 * The Great Suspender
 * Copyright (C) 2014 Dean Oemcke
 * Available under GNU GENERAL PUBLIC LICENSE v2
 * http://github.com/deanoemcke/thegreatsuspender
 * ლ(ಠ益ಠლ)
*/

/*global chrome, document, window, console */

(function() {

    'use strict';

    var inputState = false,
        tempWhitelist = false,
        timer,
        timerUp,
        prefs,
        suspendedEl = document.getElementById('gsTopBar');

    //safety check here. don't load content script if we are on the suspended page
    if (suspendedEl) return;


    function generatePreviewImg(suspendedUrl) {

        var elementCount = document.getElementsByTagName('*').length,
            processing = true;

        //safety check here. don't try to use html2canvas if the page has more than 5000 elements
        if (elementCount < 5000) {

            //allow max of 3 seconds to finish generating image (used to catch unexpected html2canvas failures)
            window.setTimeout(function() {
                if (processing) {
                    processing = false;
                    console.error('failed to render');
                    window.location.replace(suspendedUrl);
                }
            }, 3000);

            try {
                html2canvas([document.body], {
                    height: Math.min(document.body.offsetHeight, window.innerHeight) - 125,
                    width: document.body.clientWidth - 6,
                    proxy: false,
                    onrendered: function(canvas) {
                        if (processing) {
                            processing = false;
                            var quality = prefs.previewQuality ? prefs.previewQuality : 0.1;
                            chrome.runtime.sendMessage({
                                action: 'savePreviewData',
                                previewUrl: canvas.toDataURL('image/jpeg', quality)
                            });
                            window.location.replace(suspendedUrl);
                        }
                    }
                });
            } catch (ex) {
                console.error('failed to render');
                window.location.replace(suspendedUrl);
            }

        } else {
            console.error('too many page elements');
            window.location.replace(suspendedUrl);
        }
    }

    function setTimerJob(interval) {

        //slightly randomise suspension timer to spread the cpu load when multiple tabs all suspend at once
        if (interval > 4) {
            interval = interval + (Math.random() * 60 * 1000);
        }
        timerUp = new Date((new Date()).getTime() + interval);

        return setTimeout(function() {
            //request suspension
            if (!inputState && !tempWhitelist) {

                console.log('requesting suspension');
                chrome.runtime.sendMessage({action: 'suspendTab'});
            }
        }, interval);
    }

    function setFormInputJob() {

        window.addEventListener('keydown', function(event) {
            if (!inputState && !tempWhitelist) {
                if (event.keyCode >= 48 && event.keyCode <= 90 && event.target.tagName) {
                    if (event.target.tagName.toUpperCase() == 'INPUT' ||
                            event.target.tagName.toUpperCase() == 'TEXTAREA' ||
                            event.target.tagName.toUpperCase() == 'FORM') {
                        inputState = true;
                    }
                }
            }
        });
    }

    //request preferences
    chrome.runtime.sendMessage({action: 'prefs'}, function(response) {

        prefs = response;

        //add form input listener
        if (response.dontSuspendForms) {
            setFormInputJob();
        }
    });

    //listen for background events
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {

        var response = {};

        console.dir('received contentscript.js message:' + request.action + ' [' + Date.now() + ']');

        //set up suspension timer
        if (request.action === 'resetTimer' && request.timeout > 0) {
            clearTimeout(timer);
            timer = setTimerJob(request.timeout);

        //listen for status request
        } else if (request.action === 'requestInfo') {
            var status = inputState ? 'formInput' : (tempWhitelist ? 'tempWhitelist' : 'normal'),
                suspendDate;

            if (!timerUp) {
                suspendDate = new Date(new Date().getTime() + (+prefs.suspendTime * 60 * 1000));
            } else {
                suspendDate = timerUp;
            }
            suspendDate = suspendDate.toTimeString(); //getUTCHours() + ':' + suspendDate.getUTCMinutes() + ':' + suspendDate.getUTCSeconds();
            response = {status: status, timerUp: suspendDate};

        //cancel suspension timer
        } else if (request.action === 'cancelTimer') {
            clearTimeout(timer);
            timerUp = false;

        //listen for request to temporarily whitelist the tab
        } else if (request.action === 'tempWhitelist') {
            tempWhitelist = true;

        //listen for preview request
        } else if (request.action === 'generatePreview' && !inputState  && !tempWhitelist) {
            generatePreviewImg(request.suspendedUrl);

        //listen for suspend request
        } else if (request.action === 'confirmTabSuspend' && request.suspendedUrl && !inputState && !tempWhitelist) {
            window.location.replace(request.suspendedUrl);
        }

        sendResponse(response);
    });

}());
