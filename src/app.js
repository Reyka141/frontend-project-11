import * as yup from 'yup';
import i18next from 'i18next';
import axios from 'axios';
import uniqueId from 'lodash/uniqueId.js';
import watch from './view.js';
import resources from './locales/index.js';
import parserFn from './parser.js';

const addProxy = (url) => {
  const urlWithProxy = new URL('/get', 'https://allorigins.hexlet.app');
  urlWithProxy.searchParams.set('url', url);
  urlWithProxy.searchParams.set('disableCache', 'true');
  return urlWithProxy.toString();
};

export default async () => {
  const elements = {
    form: document.querySelector('.rss-form'),
    input: document.querySelector('#url-input'),
    btnSubmit: document.querySelector('[type="submit"]'),
    feedback: document.querySelector('.feedback'),
    button: document.querySelector('[type=submit]'),
    posts: document.querySelector('.posts'),
    feeds: document.querySelector('.feeds'),
    modalElements: {
      modalTitle: document.querySelector('.modal-title'),
      modalBody: document.querySelector('.modal-body'),
      modalBtn: document.querySelector('.full-article'),
    },
  };

  const defaultLang = 'ru';
  const fetchInterval = 5000;

  const state = {
    status: 'filling',
    valid: false,
    errors: '',
    loadedFeeds: [],
    contents: {
      feeds: [],
      posts: [],
      postVisited: [],
    },
    modalIcon: {
      title: '',
      description: '',
      href: '',
      idPost: '',
    },
  };

  const i18n = i18next.createInstance();
  await i18n.init({
    lng: defaultLang,
    debug: false,
    resources,
  });

  yup.setLocale({
    mixed: {
      required: 'errorMessage.required',
      notOneOf: 'errorMessage.urlNotOneOf',
    },
    string: {
      url: 'errorMessage.url',
    },
  });

  const watchedState = watch(elements, state, i18n);

  const getNewPosts = () => {
    const idLists = watchedState.contents.posts.map(({ title }) => title);
    const arr = watchedState.loadedFeeds.map(async (url) => {
      const data = await axios.get(addProxy(url));
      const [, arrOfPosts] = parserFn(data);
      const newPosts = arrOfPosts
        .filter((item) => !idLists.includes(item.title))
        .map((item) => {
          const id = uniqueId();
          return { ...item, id };
        });
      if (newPosts.length > 0) {
        watchedState.contents.posts = [...newPosts, ...watchedState.contents.posts];
      }
      return data;
    });
    Promise.all(arr).finally(() => {
      setTimeout(() => getNewPosts(), fetchInterval);
    });
  };
  getNewPosts();

  elements.btnSubmit.addEventListener('click', async (e) => {
    e.preventDefault();

    const schema = yup.object().shape({
      url: yup.string()
        .required()
        .url()
        .notOneOf(watchedState.loadedFeeds),
    });

    const formData = new FormData(elements.form);
    const newRss = Object.fromEntries(formData);
    try {
      await schema.validate(newRss, { abortEarly: false });

      watchedState.status = 'sending';

      const response = await axios.get(addProxy(newRss.url), {
        timeout: 5000,
      });

      if (response.status === 200) {
        const [feeds, posts] = parserFn(response, uniqueId);
        watchedState.contents.feeds.unshift(feeds);
        watchedState.contents.posts = [
          ...posts,
          ...watchedState.contents.posts,
        ];
        watchedState.errors = [];
        watchedState.loadedFeeds.push(newRss.url);
        watchedState.valid = true;
      } else {
        throw new Error('errorMessage.urlInValid');
      }

      watchedState.status = 'filling';
    } catch (err) {
      if (err.message === 'timeout of 5000ms exceeded') {
        watchedState.errors = 'errorMessage.timeout';
      } else {
        const { message } = err;
        watchedState.errors = message;
      }
      watchedState.status = 'filling';
    }
  });
  elements.posts.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn')) {
      const targetId = e.target.dataset.id;
      state.contents.posts.forEach((post) => {
        if (post.id === targetId) {
          state.modalIcon.title = post.title;
          state.modalIcon.description = post.description;
          state.modalIcon.href = post.link;
          watchedState.modalIcon.idPost = post.id;
        }
      });
    }
  });
};
