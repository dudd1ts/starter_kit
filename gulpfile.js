'use strict';

// Читаем содержимое package.json в константу
const pjson = require('./package.json');
// Получим из константы другую константу с адресами папок сборки и исходников
const dirs = pjson.config.directories;

// Определим необходимые инструменты
const gulp = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const mqpacker = require('css-mqpacker');
const replace = require('gulp-replace');
const fileinclude = require('gulp-file-include');
const del = require('del');
const browserSync = require('browser-sync').create();
const ghPages = require('gulp-gh-pages');
const newer = require('gulp-newer');
const imagemin = require('gulp-imagemin');
const pngquant = require('imagemin-pngquant');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');
const cheerio = require('gulp-cheerio');
const svgstore = require('gulp-svgstore');
const svgmin = require('gulp-svgmin');
const notify = require('gulp-notify');
const plumber = require('gulp-plumber');
const cleanCSS = require('gulp-cleancss');
const spritesmith = require('gulp.spritesmith');
const buffer = require('vinyl-buffer');
const merge = require('merge-stream');
const run = require("run-sequence");


// ЗАДАЧА: Компиляция препроцессора
gulp.task('sass', function(){
  return gulp.src(dirs.source + '/sass/style.scss')         // какой файл компилировать (путь из константы)
    .pipe(plumber({ errorHandler: onError }))
    .pipe(sourcemaps.init())                                // инициируем карту кода
    .pipe(sass())                                           // компилируем sass
    .pipe(postcss([                                         // делаем постпроцессинг
        autoprefixer({ browsers: ['last 2 version'] }),     // автопрефиксирование
        mqpacker(),                                         // объединение медиавыражений
    ]))
    .pipe(sourcemaps.write('/'))                            // записываем карту кода как отдельный файл (путь из константы)
    .pipe(gulp.dest(dirs.build + '/css/'))                  // записываем CSS-файл (путь из константы)
    .pipe(browserSync.stream())
    .pipe(rename('style.min.css'))                          // переименовываем
    .pipe(cleanCSS())                                       // сжимаем
    .pipe(gulp.dest(dirs.build + '/css/'));                 // записываем CSS-файл (путь из константы)
});

// ЗАДАЧА: Сборка HTML
gulp.task('html', function() {
  return gulp.src(dirs.source + '/*.html')                  // какие файлы обрабатывать (путь из константы, маска имени)
    .pipe(plumber({ errorHandler: onError }))
    .pipe(fileinclude({                                     // обрабатываем gulp-file-include
      prefix: '@@',
      basepath: '@file',
      indent: true,
    }))
    .pipe(replace(/\n\s*<!--DEV[\s\S]+?-->/gm, ''))         // убираем комментарии <!--DEV ... -->
    .pipe(gulp.dest(dirs.build));                           // записываем файлы (путь из константы)
});

// ЗАДАЧА: Копирование изображений
gulp.task('img', function () {
  return gulp.src([
        dirs.source + '/img/*.{gif,png,jpg,jpeg,svg}',      // какие файлы обрабатывать (путь из константы, маска имени, много расширений)
      ]
    )
    .pipe(plumber({ errorHandler: onError }))
    .pipe(newer(dirs.build + '/img'))                       // оставить в потоке только новые файлы (сравниваем с содержимым папки билда)
    .pipe(gulp.dest(dirs.build + '/img'));                  // записываем файлы (путь из константы)
});

// ЗАДАЧА: Оптимизация изображений (ЗАДАЧА ЗАПУСКАЕТСЯ ТОЛЬКО ВРУЧНУЮ)
gulp.task('img:opt', function () {
  return gulp.src([
      dirs.source + '/img/*.{gif,png,jpg,jpeg,svg}',        // какие файлы обрабатывать (путь из константы, маска имени, много расширений)
      '!' + dirs.source + '/img/sprite-svg.svg',            // SVG-спрайт брать в обработку не будем
    ])
    .pipe(plumber({ errorHandler: onError }))
    .pipe(imagemin({                                        // оптимизируем
      progressive: true,
      svgoPlugins: [{removeViewBox: false}],
      use: [pngquant()]
    }))
    .pipe(gulp.dest(dirs.source + '/img'));                  // записываем файлы в исходную папку
});

// ЗАДАЧА: Сборка SVG-спрайта
gulp.task('sprite:svg', function (callback) {
  let spritePath = dirs.source + '/img/svg-sprite';          // константа с путем к исходникам SVG-спрайта
  if(fileExist(spritePath) !== false) {
    return gulp.src(spritePath + '/*.svg')                   // берем только SVG файлы из этой папки, подпапки игнорируем
      .pipe(svgmin(function (file) {
        return {
          plugins: [{
            cleanupIDs: {
              minify: true
            }
          }]
        }
      }))
      .pipe(svgstore({ inlineSvg: true }))
      .pipe(cheerio(function ($) {
        $('svg').attr('style',  'display:none');             // дописываем получающемуся SVG-спрайту инлайновое сокрытие
      }))
      .pipe(rename('sprite-svg.svg'))
      .pipe(gulp.dest(dirs.source + '/img'));
  }
  else {
    console.log('Нет файлов для сборки SVG-спрайта');
    callback();
  }
});

// ЗАДАЧА: сшивка PNG-спрайта
gulp.task('sprite:png', function () {
  let fileName = 'sprite-' + Math.random().toString().replace(/[^0-9]/g, '') + '.png';
  let spriteData = gulp.src('src/img/png-sprite/*.png')
    .pipe(plumber({ errorHandler: onError }))
    .pipe(spritesmith({
      imgName: fileName,
      cssName: 'sprite.scss',
      padding: 4,
      imgPath: '../img/' + fileName
    }));
  let imgStream = spriteData.img
    .pipe(buffer())
    .pipe(imagemin())
    .pipe(gulp.dest('build/img'));
  let cssStream = spriteData.css
    .pipe(gulp.dest(dirs.source + '/sass/'));
  return merge(imgStream, cssStream);
});

// ЗАДАЧА: Очистка папки сборки
gulp.task('clean', function () {
  return del([                                              // стираем
    dirs.build + '/**/*',                                   // все файлы из папки сборки (путь из константы)
    '!' + dirs.build + '/readme.md'                         // кроме readme.md (путь из константы)
  ]);
});

// ЗАДАЧА: Конкатенация и углификация Javascript
gulp.task('js', function () {
  return gulp.src([
      // список обрабатываемых файлов
      dirs.source + '/js/jquery-3.1.0.min.js',
      dirs.source + '/js/script.js',
    ])
    .pipe(plumber({ errorHandler: onError }))
    .pipe(concat('script.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest(dirs.build + '/js'));
});

// ЗАДАЧА: Копирование шрифтов
gulp.task('fonts', function () {
  return gulp.src(dirs.source + '/fonts/*.{ttf,woff,woff2,eot,svg}')
    .pipe(newer(dirs.build + '/fonts'))  // оставить в потоке только изменившиеся файлы
    .pipe(gulp.dest(dirs.build + '/fonts'));
});

gulp.task('build', function (callback) {
  run(                             // последовательно:
  'clean',
  'sprite:svg',
  'sprite:png',
  ['sass', 'img', 'js', 'fonts'],
  'html',
  callback
  );
});

// ЗАДАЧА: Локальный сервер, слежение
gulp.task('serve', ['build'], function() {

  browserSync.init({                                        // запускаем локальный сервер (показ, автообновление, синхронизацию)
    server: './build/',
    port: 3000,
    startPath: '/index.html',                               // файл, который будет открываться в браузере при старте сервера
    open: true
  });

  gulp.watch(                                               // следим за HTML
    [
      dirs.source + '/*.html',                              // в папке с исходниками
      dirs.source + '/_include/*.html',                     // и в папке с мелкими вставляющимся файлами
    ],
    {cwd: dirs.source},
    ['watch:html']                                          // при изменении файлов запускаем пересборку HTML и обновление в браузере
  );

  gulp.watch(                                               // следим за sass
    dirs.source + '/sass/**/*.scss',
    ['sass']                                                // при изменении запускаем компиляцию (обновление браузера — в задаче компиляции)
  );

  gulp.watch(                                               // следим за SVG
    dirs.source + '/img/svg-sprite/*.svg',
    {cwd: dirs.source+ '/img/svg-sprite/'},
    'watch:sprite:svg' //'html'
  );

  gulp.watch(                                               // следим за PNG, которые для спрайтов
    dirs.source + '/img/png-sprite/*.png',
    {cwd: dirs.source+ '/img/png-sprite/'},
    'watch:sprite:png' //'sass'
  );

  gulp.watch(                                               // следим за изображениями
    dirs.source + '/img/*.{gif,png,jpg,jpeg,svg}',
    ['watch:img']
  );

  gulp.watch(                                               // следим за JS
    dirs.source + '/js/*.js',
    ['watch:js']
  );

  gulp.watch(                                               // следим за шрифтами
    dirs.source + '/fonts/*.{ttf,woff,woff2,eot,svg}',
    ['watch:fonts']
  );
});

gulp.task('watch:img', ['img'], reload);
gulp.task('watch:fonts', ['fonts'], reload);
gulp.task('watch:html', ['html'], reload);
gulp.task('watch:js', ['js'], reload);
gulp.task('watch:sprite:svg', ['sprite:svg'], reload);
gulp.task('watch:sprite:png', ['sprite:png'], reload);

// ЗАДАЧА, ВЫПОЛНЯЕМАЯ ТОЛЬКО ВРУЧНУЮ: Отправка в GH pages (ветку gh-pages репозитория)
gulp.task('deploy', function() {
  return gulp.src('./build/**/*')
    .pipe(ghPages());
});

// ЗАДАЧА: Задача по умолчанию
gulp.task('default', ['serve']);

// Дополнительная функция для перезагрузки в браузере
function reload(done) {
  browserSync.reload();
  done();
}

// Проверка существования файла/папки
function fileExist(path) {
  const fs = require('fs');
  try {
    fs.statSync(path);
  } catch(err) {
    return !(err && err.code === 'ENOENT');
  }
}

var onError = function(err) {
    notify.onError({
      title: "Error in " + err.plugin,
    })(err);
    this.emit('end');
};
