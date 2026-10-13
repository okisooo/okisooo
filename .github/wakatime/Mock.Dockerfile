# CI only: the upstream fake avatar URL can hang while downloading an image.
FROM metrics:forked-3.34.0
RUN sed -i 's/avatarUrl: faker.image.urlLoremFlickr({category: "people"}),/avatarUrl: null,/' \
    /metrics/tests/mocks/api/github/graphql/base.user.mjs
