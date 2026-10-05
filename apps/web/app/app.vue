<template>
  <UApp>
    <UHeader title="Nimiq Pool Fee Monitor" to="/">
      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>
    <UMain>
      <UContainer class="py-8">
        <NuxtPage />
      </UContainer>
    </UMain>
    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Real fees measured on-chain with dedicated stakers. Listed fees come from the Nimiq validators-api.
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
