var ExtensionPreprocessingJS = function() {};
ExtensionPreprocessingJS.prototype = {
  run: function(arguments) {
    var canonical = document.querySelector('link[rel="canonical"]');
    var description = document.querySelector('meta[name="description"], meta[property="og:description"]');
    arguments.completionFunction({
      url: canonical && canonical.href || location.href,
      title: document.title || '',
      description: description && description.content || '',
      excerpt: document.body && document.body.innerText.slice(0, 4000) || '',
      selectedText: String(window.getSelection() || '').slice(0, 4000)
    });
  }
};
