/*
  zelect-0.0.9

  opts:
    throttle:       ms: delay to throttle filtering of results when search term updated, 0 means synchronous
    loader:         function(term, page, callback): load more items
                      callback expects an array of items
    renderItem:     function(item, term): render the content of a single item
    initial:        "item": arbitrary item to set the initial selection to
                      placeholder is not required if initial item is provided
    placeholder:    String/DOM/jQuery: placeholder text/html before anything is selected
                      zelect automatically selects first item if not provided
    noResults:      function(term?): function to create no results text
    regexpMatcher:  function(term): override regexp creation when filtering options
*/

/*
* 2013-08-01
* Fixed submit-on-enter issue in the keydown event //frex
* Disable mouseover to change the selected option //frex
*
* 2013-08-20
* Set the selected item after click. Before it was reset to the first item in the list //frex
*
* 2013-12-18
* Added css classes
*/

(function($) {
  var keys = { tab:9, enter:13, esc:27, left:37, up:38, right:39, down:40, space:32  }  //adam, added space key
  var defaults = {
    throttle: 300,
    renderItem: defaultRenderItem,
    noResults: defaultNoResults,
    regexpMatcher: defaultRegexpMatcher
  }

  $.fn.zelect = function(opts) {
    opts = $.extend({}, defaults, opts)

    return this.each(function() {
      if ($(this).parent().length === 0) throw new Error('<select> element must have a parent')
      var $select = $(this).hide().data('zelectItem', selectItem).data('refreshItem', refreshItem).data('reset', reset)
      var $zelect = $('<div>').addClass('zelect')
      var $selected = $('<div>').addClass('zelected')
      var $dropdown = $('<div>').addClass('zelect-dropdown').hide() //frex, added css class
      var $noResults = $('<div>').addClass('no-results')
      var $search = $('<input>').addClass('zearch')
      var $list = $('<ol>').addClass("list") //frex, added css class

      var listNavigator = navigable($list)

      var itemHandler = opts.loader
        ? infiniteScroll($list, opts.loader, appendItem)
        : selectBased($select, $list, opts.regexpMatcher, appendItem)

      var filter = throttled(opts.throttle, function() {
        var term = searchTerm()
        itemHandler.load(term, function() { checkResults(term) })
      })

      $search.keyup(function(e) {
        switch (e.which) {
          case keys.esc: hide(); return;
          case keys.up: return;
          case keys.down: return;
          case keys.enter:
            var curr = listNavigator.current().data('zelect-item')
            if (curr) selectItem(curr)
            return
          default: filter()
        }
      })
      $search.keydown(function(e) {
        switch (e.which) {
          case keys.tab: $zelect.removeClass('hover'); hide(); return;
          case keys.up: e.preventDefault(); listNavigator.prev(); return;
          case keys.down: e.preventDefault(); listNavigator.next(); return;
          case keys.enter: e.preventDefault(); return; //frex, added event
        }
      })

      $list.on('click', 'li', function() {
        var $item = $(this);
        selectItem($item.data('zelect-item'))
        hide(false) // adam, hiding select but not refocusing the hidden input
        listNavigator.set($item); //frex, added call
      })
      $zelect.mouseenter(function() { $zelect.addClass('hover') })
      $zelect.mouseleave(function() { $zelect.removeClass('hover') })
      $zelect.attr("tabindex", $select.attr("tabindex"))
      $zelect.blur(function() { if (!$zelect.hasClass('hover')) hide() })
      $search.blur(function() { if (!$zelect.hasClass('hover')) hide() })

      $selected.click(toggle)

      $zelect.insertAfter($select)
        .append($selected)
        .append($dropdown.append($('<div>').addClass('zearch-container').append($search).append($noResults)).append($list))

      var focusZelect = function() {
        toggle();
      };

      var $tabtrigger = $('<input>').css({ height: 1, width: 1, zIndex: -1, position: "absolute", padding: 1, background:"transparent", border: 0}).focus(focusZelect).on('keyup', function(e) {
            if ( e.which === keys.space || e.which === keys.down) {
                e.preventDefault();
                toggle();
                return false;
            }
        }); //adam, added element for tabbing index
      if (opts.skipTabIndex) {
        $tabtrigger.attr('tabindex', -1);
      }
      $tabtrigger.insertAfter($zelect); //adam, inserting tabbing helpers

      itemHandler.load($search.val(), function() {
        initialSelection(true)
        $select.trigger('ready')
      })

      function selectItem(item, triggerChange) {
        renderContent($selected, opts.renderItem(item, true)).removeClass('placeholder')
        hide()
        if (item && item.value !== undefined) $select.val(item.value)
        $select.data('zelected', item)
        if (triggerChange == null || triggerChange === true) $select.trigger('change', item)
      }

      function refreshItem(item, identityCheckFn) {
        var eq = function(a, b) { return identityCheckFn(a) === identityCheckFn(b) }
        if (eq($select.data('zelected'), item)) {
          renderContent($selected, opts.renderItem(item))
          $select.data('zelected', item)
        }
        var term = searchTerm()
        $list.find('li').each(function() {
          if (eq($(this).data('zelect-item'), item)) {
            renderContent($(this), opts.renderItem(item, false, term)).data('zelect-item', item)
          }
        })
      }

      function reset() {
        $search.val('')
        itemHandler.load('', function() {
          initialSelection(false)
        })
      }

      function toggle() {
        $dropdown.toggle()
        $zelect.toggleClass('open')
        if ($dropdown.is(':visible')) {
          $search.focus().select()
          itemHandler.check()
          listNavigator.ensure()
        }
      }

      function hide(refocus) {//adam, adding refocus variable
        $tabtrigger.unbind('focus'); //adam, we want to unbind the focus event listener as we dont want to reopen the zelect when the 'hidden' input for tabbing is refocussed
        $dropdown.hide()
        $zelect.removeClass('open')

        if (refocus != false)
            $tabtrigger.trigger('focus'); // adam, when something is selected we need to refocus the 'hidden' input field to allow tabbing to continue

        setTimeout(function() {
            $tabtrigger.unbind('focus');
            $tabtrigger.focus(focusZelect);
        }, 100); //adam, we need to safely rebind the event listener again as we want to listen to the subsequent calls to this
      }

      function renderContent($obj, content) {
        $obj[htmlOrText(content)](content)
        return $obj
        function htmlOrText(x) { return (x instanceof jQuery || x.nodeType != null) ? 'html' : 'text' }
      }

      function appendItem(item, term) {
        $list.append(renderContent($('<li>').addClass("item").data('zelect-item', item), opts.renderItem(item, false, term))) //frex, added css class
      }

      function checkResults(term) {
        if ($list.children().size() === 0) {
          $noResults.html(opts.noResults(term)).show()
        } else {
          $noResults.hide()
          listNavigator.ensure()
        }
      }
      function searchTerm() { return $.trim($search.val()) }

      function initialSelection(useOptsInitial) {
        var $s = $select.find('option[selected="selected"]')
        if (useOptsInitial && opts.initial) {
          selectItem(opts.initial)
        } else if (!opts.loader && $s.size() > 0) {
          selectItem($list.children().eq($s.index()).data('zelect-item'))
        } else if (opts.placeholder) {
          $selected.html(opts.placeholder).addClass('placeholder')
        } else {
          var first = $list.find(':first').data('zelect-item')
          first !== undefined ? selectItem(first) : $selected.html(opts.noResults()).addClass('placeholder')
        }
        checkResults()
      }
    })
  }

  function selectBased($select, $list, regexpMatcher, appendItemFn) {
    var dummyRegexp = { test: function() { return true } }
    var options = $select.find('option').map(function() { return itemFromOption($(this)) }).get()

    function filter(term) {
      var regexp = (term === '') ? dummyRegexp : regexpMatcher(term)
      $list.empty()
      $.each(options, function(ii, item) {
        if (regexp.test(item.label)) appendItemFn(item, term)
      })
    }
    function itemFromOption($option) {
      return { value: $option.attr('value'), label: $option.text() }
    }
    function newTerm(term, callback) {
      filter(term)
      if (callback) callback()
    }
    return { load:newTerm, check:function() {} }
  }

  function infiniteScroll($list, loadFn, appendItemFn) {
    var state = { id:0, term:'', page:0, loading:false, exhausted:false, callback:undefined }

    $list.scroll(maybeLoadMore)

    function load() {
      if (state.loading || state.exhausted) return
      state.loading = true
      $list.addClass('loading')
      var stateId = state.id
      loadFn(state.term, state.page, function(items) {
        if (stateId !== state.id) return
        if (state.page == 0) $list.empty()
        state.page++
        if (!items || items.length === 0) state.exhausted = true
        $.each(items, function(ii, item) { appendItemFn(item, state.term) })
        state.loading = false
        if (!maybeLoadMore()) {
          if (state.callback) state.callback()
          state.callback = undefined
          $list.removeClass('loading')
        }
      })
    }

    function maybeLoadMore() {
      if (state.exhausted) return false
      var $lastChild = $list.children(':last')
      if ($lastChild.size() === 0) {
        load()
        return true
      } else {
        var lastChildTop = $lastChild.offset().top - $list.offset().top
        var lastChildVisible = lastChildTop < $list.outerHeight(false)
        if (lastChildVisible) load()
        return lastChildVisible
      }
    }

    function newTerm(term, callback) {
      state = { id:state.id+1, term:term, page:0, loading:false, exhausted:false, callback:callback }
      load()
    }
    return { load:newTerm, check:maybeLoadMore }
  }

  $.fn.zelectItem = callInstance('zelectItem')
  $.fn.refreshZelectItem = callInstance('refreshItem')
  $.fn.resetZelect = callInstance('reset')

  function callInstance(fnName) {
    return function() {
      var args = [].slice.call(arguments)
      return this.each(function() {
        var fn = $(this).data(fnName)
        fn && fn.apply(undefined, args)
      })
    }
  }

  function throttled(ms, callback) {
    if (ms <= 0) return callback
    var timeout = undefined
    return function() {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(callback, ms)
    }
  }

  function defaultRenderItem(item, term) {
    if (item == undefined || item == null) {
      return ''
    } else if ($.type(item) === 'string') {
      return item
    } else if (item.label) {
      return item.label
    } else if (item.toString) {
      return item.toString()
    } else {
      return item
    }
  }

  function defaultNoResults(term) {
    return "No results for '"+(term || '')+"'"
  }

  function defaultRegexpMatcher(term) {
    return new RegExp('(^|\\s)'+term, 'i')
  }

  function navigable($list) {
    var skipMouseEvent = false
    //$list.on('mouseenter', 'li', onMouseEnter) //frex, uncommented

    function next() {
      var $next = current().next('li')
      if (set($next)) ensureBottomVisible($next)
    }
    function prev() {
      var $prev = current().prev('li')
      if (set($prev)) ensureTopVisible($prev)
    }
    function current() {
      return $list.find('.current')
    }
    function ensure() {
      if (current().size() === 0) {
        $list.find('li:first').addClass('current')
      }
    }
    function set($item) {
      if ($item.size() === 0) return false
      current().removeClass('current')
      $item.addClass('current')
      return true
    }
    function onMouseEnter() {
      if (skipMouseEvent) {
        skipMouseEvent = false
        return
      }
      set($(this))
    }
    function itemTop($item) {
      return $item.offset().top - $list.offset().top
    }
    function ensureTopVisible($item) {
      var scrollTop = $list.scrollTop()
      var offset = itemTop($item) + scrollTop
      if (scrollTop > offset) {
        moveScroll(offset)
      }
    }
    function ensureBottomVisible($item) {
      var scrollBottom = $list.height()
      var itemBottom = itemTop($item) + $item.outerHeight(false)
      if (scrollBottom < itemBottom) {
        moveScroll($list.scrollTop() + itemBottom - scrollBottom)
      }
    }
    function moveScroll(offset) {
      $list.scrollTop(offset)
      skipMouseEvent = true
    }
    return { next:next, prev:prev, current:current, ensure:ensure, set:set } //frex, exposed 'set'
  }
})(jQuery)
